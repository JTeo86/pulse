import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Camera, Wand2, Download,
  CheckSquare, Square, AlertTriangle, Loader2, Star,
  RotateCcw, Image as ImageIcon, Info,
  ThumbsUp, ThumbsDown, Sun, Moon, Palette, Eye, Utensils, Sparkles, Trash2, Check,
} from 'lucide-react';
import { usePhaseFlags } from '@/hooks/use-phase-flags';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { isMissingBillingSchemaError } from '@/lib/billing-readiness';
import { BackButton } from '@/components/navigation/BackButton';

// ── Types ────────────────────────────────────────────────────────────

type ShotType = 'social_ready' | 'backdrop' | 'campaign';

const SHOT_TYPES: { key: ShotType; label: string; desc: string; detail: string; warn?: boolean; default?: boolean }[] = [
  {
    key: 'social_ready',
    label: 'Social Ready',
    desc: 'Improve your real photo for posting. Keeps the original scene.',
    detail: 'Natural clean-up and polish while preserving composition, angle, and environment.',
    default: true,
  },
  {
    key: 'backdrop',
    label: 'Backdrop',
    desc: 'Place your dish on a clean or branded surface.',
    detail: 'Dish-first compositing workflow with a single continuous surface and realistic shadow.',
  },
  {
    key: 'campaign',
    label: 'Campaign',
    desc: 'Create a stylised promotional image.',
    detail: 'Creative, high-impact campaign styling while preserving dish identity.',
    warn: true,
  },
];

const FEEDBACK_OPTIONS: { type: string; label: string; icon: typeof ThumbsUp }[] = [
  { type: 'approved', label: 'Approved', icon: ThumbsUp },
  { type: 'great_match', label: 'Great Match', icon: Sparkles },
  { type: 'rejected', label: 'Rejected', icon: ThumbsDown },
  { type: 'too_dark', label: 'Too Dark', icon: Moon },
  { type: 'too_bright', label: 'Too Bright', icon: Sun },
  { type: 'too_generic', label: 'Too Generic', icon: Palette },
  { type: 'not_our_style', label: 'Not Our Style', icon: Eye },
  { type: 'dish_changed', label: 'Dish Changed', icon: Utensils },
];

// ── Helpers ──────────────────────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CreditBar({ used, total, label }: { used: number; total: number; label: string }) {
  const remaining = Math.max(0, total - used);
  const pct = Math.min(100, (used / total) * 100);
  const isLow = remaining <= 5;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>{label}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[80px]">
        <div className={cn('h-full rounded-full transition-all', isLow ? 'bg-destructive' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn('font-medium', isLow ? 'text-destructive' : 'text-foreground')}>{remaining} left</span>
    </div>
  );
}

function StyleSourceBadge({ sources, refCount }: { sources: string[]; refCount: number }) {
  let label = 'Brand profile only';
  if (sources.includes('reference_images') && sources.includes('venue_style_profiles')) {
    label = `Style profile + ${refCount} reference${refCount !== 1 ? 's' : ''}`;
  } else if (sources.includes('reference_images')) {
    label = `Brand profile + ${refCount} reference${refCount !== 1 ? 's' : ''}`;
  } else if (sources.includes('venue_style_profiles')) {
    label = 'Style profile';
  } else if (sources.includes('style_reference_assets')) {
    label = `Legacy refs (${refCount})`;
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1">
      <Palette className="w-3 h-3" /> {label}
    </Badge>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function TheEditorPage() {
  const { user } = useAuth();
  const { currentVenue, isAdmin } = useVenue();
  const { toast } = useToast();
  const phaseFlags = usePhaseFlags();
  const videoEnabled = phaseFlags.video_enabled;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const planId = searchParams.get('plan_id');
  const briefId = searchParams.get('brief_id');
  const briefTitle = searchParams.get('brief_title');
  const promptParam = searchParams.get('prompt');
  const contextParam = searchParams.get('context');
  const eventTitleParam = searchParams.get('event_title');

  const autoObjective = promptParam || (briefTitle ? `Create a premium campaign image for ${briefTitle}.` : eventTitleParam ? `Create a premium campaign image for ${eventTitleParam}.` : 'Generate a realistic, high-quality food photo.');
  const autoContext = contextParam || (briefTitle ? `This visual supports ${briefTitle}. Keep it on-brand and post-ready.` : 'Match venue style with a clean, minimal scene.');

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [shotType, setShotType] = useState<ShotType>('social_ready');

  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<{
    final_image_url: string;
    final_image_variants: Record<string, string>;
    reference_count: number;
    background_source: string;
    style_sources: string[];
    edited_asset_id: string | null;
    storage_path: string | null;
    output_asset_id: string | null;
    generation_mode: string;
    generation_warning?: string | null;
  } | null>(null);
  const latestResultRef = useRef<{ url: string; generationMode: string } | null>(null);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [fidelityConfirmed, setFidelityConfirmed] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const month = new Date().toISOString().slice(0, 7);
  const { data: creditsData } = useQuery({
    queryKey: ['the-editor-credits', currentVenue?.id, month],
    enabled: !!currentVenue,
    queryFn: async () => {
      const venueId = currentVenue!.id;
      const [entitlementsRes, usageRes, limitsRes] = await Promise.all([
        supabase.from('venue_entitlements').select('monthly_image_quota').eq('venue_id', venueId).maybeSingle(),
        supabase.from('editor_usage').select('pro_photo_used').eq('venue_id', venueId).eq('month', month).maybeSingle(),
        supabase.from('venue_limits').select('monthly_pro_photo_credits').eq('venue_id', venueId).maybeSingle(),
      ]);

      const schemaMissing = [entitlementsRes.error, usageRes.error, limitsRes.error].some((error) => error && isMissingBillingSchemaError(error));
      if (usageRes.error && !isMissingBillingSchemaError(usageRes.error)) throw usageRes.error;
      if (entitlementsRes.error && !isMissingBillingSchemaError(entitlementsRes.error)) throw entitlementsRes.error;
      if (limitsRes.error && !isMissingBillingSchemaError(limitsRes.error)) throw limitsRes.error;

      return {
        schemaMissing,
        used: usageRes.data?.pro_photo_used ?? 0,
        limit: entitlementsRes.data?.monthly_image_quota ?? limitsRes.data?.monthly_pro_photo_credits ?? 0,
      };
    },
  });
  const proPhotoUsed = creditsData?.used ?? 0;
  const proPhotoLimit = creditsData?.limit ?? 0;
  const billingUnavailable = Boolean(creditsData?.schemaMissing);

  useEffect(() => {
    if (!jobResult?.final_image_url) return;
    latestResultRef.current = {
      url: jobResult.final_image_url,
      generationMode: jobResult.generation_mode || shotType,
    };
  }, [jobResult, shotType]);

  const handleFileDrop = useCallback(async (file: File) => {
    if (!currentVenue || !user) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please upload an image file.' });
      return;
    }
    setUploadedFile(file);
    setUploadedPreview(URL.createObjectURL(file));
    setJobResult(null);
    setJobId(null);
    setFidelityConfirmed(false);
    setFeedbackSent(null);
  }, [currentVenue, user, toast]);

  const onDropZone = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileDrop(file);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileDrop(file);
  };

  const handleGenerate = async () => {
    if (!currentVenue || !user || !uploadedFile) return;
    if (proPhotoLimit > 0 && proPhotoUsed >= proPhotoLimit) {
      toast({ variant: 'destructive', title: 'Credit limit reached', description: 'Contact admin to increase credits.' });
      return;
    }

    setGenerating(true);
    setJobResult(null);
    setSavedToLibrary(false);
    setFidelityConfirmed(false);
    setFeedbackSent(null);
    try {
      const base64 = await fileToBase64(uploadedFile);

      const { data: newJob, error: createError } = await supabase
        .from('editor_jobs')
        .insert({
          venue_id: currentVenue.id,
          created_by: user.id,
          status: 'queued',
          mode: 'pro_photo',
          realism_mode: shotType,
          style_preset: 'clean_studio',
        })
        .select('id')
        .single();

      if (createError) throw createError;
      setJobId(newJob.id);

      const skipLibrarySave = !planId;

      const { data, error: fnError } = await supabase.functions.invoke('editor-generate-pro-photo', {
        body: {
          job_id: newJob.id,
          venue_id: currentVenue.id,
          sourceFileBase64: base64,
          sourceFileName: uploadedFile.name,
          realism_mode: shotType,
          skip_library_save: skipLibrarySave,
          prompt_override: autoObjective,
          context_hint: autoContext,
        },
      });
      if (fnError) {
        const fnMessage = (data as any)?.error || fnError.message;
        throw new Error(fnMessage);
      }

      // Validate the response contains a usable result
      if (!data?.final_image_url) {
        const errDetail = data?.error || 'No image was returned by the AI. Please try again.';
        console.error('[Pro Photo] Generation succeeded but no final_image_url in response:', data);
        throw new Error(errDetail);
      }

      setJobResult({
        final_image_url: data.final_image_url,
        final_image_variants: (data.final_image_variants as Record<string, string>) || {},
        reference_count: data.reference_count || 0,
        background_source: data.background_source || 'ai_generated',
        style_sources: data.style_sources || [],
        edited_asset_id: data.edited_asset_id || null,
        storage_path: data.storage_path || null,
        output_asset_id: data.output_asset_id || null,
        generation_mode: data.generation_mode || shotType,
        generation_warning: data.generation_warning || null,
      });

      if (planId && data.output_asset_id) {
        try {
          await supabase.from('plan_assets').insert({
            plan_id: planId,
            asset_brief_id: briefId || null,
            content_asset_id: data.output_asset_id,
            asset_type: 'image',
            status: 'created',
            metadata: { source: 'pro_photo', brief_title: briefTitle || null },
          });
          if (briefId) {
            await supabase.from('plan_asset_briefs').update({ status: 'created' }).eq('id', briefId);
          }
          await supabase.from('content_items').insert({
            venue_id: currentVenue.id,
            source: 'generated',
            status: 'draft',
            title: briefTitle ? `Pro Photo · ${briefTitle}` : 'Pro Photo',
            caption_draft: 'Generated from a campaign brief. Ready for your approval.',
            media_master_url: data.final_image_url,
            storage_path: data.storage_path || null,
            asset_type: 'image',
            source_plan_title: briefTitle || null,
            media_variants: {
              source_asset_id: data.output_asset_id,
              editor_job_id: newJob.id,
              generation_mode: data.generation_mode || shotType,
            },
          });
          setSavedToLibrary(true);
        } catch (linkErr) {
          console.error('Failed to auto-link asset to plan:', linkErr);
        }
      }

      toast({
        title: 'Pro Photo generated',
        description: planId ? 'Added to Content Queue and linked to your campaign.' : 'Review the result below.',
      });
    } catch (err: any) {
      const errMessage = err?.message || 'AI photo generation failed. Please try again.';
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: errMessage,
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleDownloadLatest = async () => {
    const latest = latestResultRef.current;
    const latestUrl = latest?.url || jobResult?.final_image_url;
    if (!latestUrl) return;
    const effectiveShotType = latest?.generationMode || shotType;
    await handleDownload(latestUrl, `pro-photo-${effectiveShotType}-${Date.now()}.jpg`);
  };

  const handleFidelityConfirm = async () => {
    if (!jobId) return;
    const newVal = !fidelityConfirmed;
    setFidelityConfirmed(newVal);
    if (newVal) {
      await supabase.from('editor_jobs').update({
        fidelity_confirmed: true,
        fidelity_confirmed_at: new Date().toISOString(),
      }).eq('id', jobId);
    }
  };

  const handleFeedback = async (feedbackType: string) => {
    if (!currentVenue || !user || !jobResult?.edited_asset_id) return;
    setFeedbackSent(feedbackType);
    try {
      await supabase.from('venue_style_feedback').insert({
        venue_id: currentVenue.id,
        edited_asset_id: jobResult.edited_asset_id,
        feedback_type: feedbackType,
        created_by: user.id,
      });

      if (feedbackType === 'approved' || feedbackType === 'great_match') {
        const finalUrl = jobResult.final_image_url;
        const storagePath = `venues/${currentVenue.id}/style/approved_output/${crypto.randomUUID()}.jpg`;
        await supabase.from('venue_style_reference_assets').insert({
          venue_id: currentVenue.id,
          storage_path: storagePath,
          public_url: finalUrl,
          source_type: 'approved_output',
          channel: 'approved_output',
          label: `Approved output (${new Date().toLocaleDateString()})`,
          created_by: user.id,
        });
      }

      toast({ title: 'Feedback recorded', description: `Marked as: ${feedbackType.replace(/_/g, ' ')}` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Feedback failed', description: err.message });
    }
  };

  const handleReset = () => {
    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview);
    setUploadedFile(null);
    setUploadedPreview(null);
    setJobId(null);
    setJobResult(null);
    setFidelityConfirmed(false);
    setFeedbackSent(null);
    setSavedToLibrary(false);
  };

  const handleSaveToLibrary = async () => {
    if (!currentVenue || !user || !jobResult?.storage_path || savedToLibrary) return;
    try {
      const shotLabel = shotType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const { data: savedAsset, error: assetError } = await supabase.from('content_assets').insert({
        venue_id: currentVenue.id,
        created_by: user.id,
        asset_type: 'image',
        source_type: 'generated_image',
        status: 'draft',
        title: `Pro Photo · ${shotLabel}`,
        storage_path: jobResult.storage_path,
        public_url: jobResult.final_image_url,
        mime_type: 'image/jpeg',
        derived_from_editor_job_id: jobId || null,
        source_job_id: jobResult.edited_asset_id || null,
        prompt_snapshot: { generation_mode: shotType },
        generation_settings: {
          generation_mode: shotType,
          reference_count: jobResult.reference_count,
          style_sources: jobResult.style_sources,
        },
        metadata: {
          generation_mode: shotType,
          edited_asset_id: jobResult.edited_asset_id || null,
        },
      }).select('id').single();
      if (assetError) throw assetError;

      const { error: queueError } = await supabase.from('content_items').insert({
        venue_id: currentVenue.id,
        source: 'generated',
        status: 'draft',
        title: `Pro Photo · ${shotLabel}`,
        caption_draft: 'Generated in Pro Photo. Ready for your approval.',
        media_master_url: jobResult.final_image_url,
        storage_path: jobResult.storage_path,
        asset_type: 'image',
        media_variants: {
          source_asset_id: savedAsset?.id || null,
          editor_job_id: jobId || null,
          generation_mode: shotType,
        },
      });
      if (queueError) throw queueError;

      setSavedToLibrary(true);
      toast({ title: 'Accepted', description: 'Saved to Content Queue and ready for approval.' });
      navigate('/content/library?tab=queue');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: err.message });
    }
  };

  const handleDiscard = async () => {
    if (!jobResult?.storage_path) {
      handleReset();
      return;
    }
    try {
      await supabase.storage.from('content-library').remove([jobResult.storage_path]);
    } catch { /* best effort */ }
    handleReset();
    toast({ title: 'Image discarded' });
  };

  const handleRejectAndRegenerate = async (feedbackType: string) => {
    await handleFeedback(feedbackType);
    setJobResult(null);
    setJobId(null);
    setFidelityConfirmed(false);
    setFeedbackSent(null);
    setSavedToLibrary(false);
    toast({ title: 'Feedback recorded', description: 'Try generating again with different settings.' });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl mx-auto space-y-5"
    >
      <BackButton fallbackTo={planId ? `/content/planner/plan/${planId}` : '/content/library'} />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pro Photo Studio</h1>
        <p className="text-sm text-muted-foreground">Upload → Generate → Accept. Pulse auto-builds your premium Pro Photo prompt.</p>
      </div>

      <div className="flex items-center gap-6 px-4 py-2.5 rounded-lg bg-muted/30 border border-border/50 w-fit">
        <CreditBar used={proPhotoUsed} total={Math.max(proPhotoLimit, 1)} label="Pro Photo" />
        {!videoEnabled && (
          <span className="text-xs text-muted-foreground ml-2 border-l border-border pl-4">
            Video generation paused
          </span>
        )}
        {billingUnavailable && (
          <span className="text-xs text-muted-foreground ml-2 border-l border-border pl-4">
            Usage limits unavailable in this environment
          </span>
        )}
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        {(planId && briefTitle) || promptParam ? (
          <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-muted-foreground">
            {briefTitle ? `Prefilled from plan: ${briefTitle}.` : 'Prompt was prefilled from your previous flow.'}
          </div>
        ) : null}
        <div
          onDrop={onDropZone}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => !uploadedFile && fileInputRef.current?.click()}
          className={cn(
            'rounded-lg border border-dashed p-4 transition-colors',
            isDragging ? 'border-accent bg-accent/5' : 'border-border',
          )}
        >
          {uploadedPreview ? (
            <div className="space-y-2">
              <img src={uploadedPreview} alt="Uploaded dish" className="w-full max-h-64 object-cover rounded-md border" />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                Replace source image
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">Drop a source image here or click to upload.</p>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileInput} />
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3.5 py-3 space-y-2">
          <p className="text-xs font-medium text-foreground/90">Automatic prompt system enabled</p>
          <p className="text-xs text-muted-foreground">
            Objective: {autoObjective}
          </p>
          <p className="text-xs text-muted-foreground">
            Context: {autoContext}
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={!uploadedFile || generating} className="w-full gap-2" size="lg">
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Crafting realistic Pro Photo...</> : <><Wand2 className="w-4 h-4" /> Generate Pro Photo</>}
        </Button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={jobResult?.final_image_url || 'preview'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="rounded-xl border bg-card p-5 space-y-4"
        >
          <p className="text-sm font-medium">Image Preview</p>
          {jobResult?.final_image_url ? (
            <img src={jobResult.final_image_url} alt="Generated Pro Photo" className="w-full max-h-[520px] object-cover rounded-lg border" />
          ) : generating ? (
            <div className="h-64 rounded-lg border border-dashed flex items-center justify-center text-sm text-muted-foreground animate-pulse">
              Building your premium photo with venue-aware realism...
            </div>
          ) : (
            <div className="h-64 rounded-lg border border-dashed flex items-center justify-center text-sm text-muted-foreground">
              Generate to preview your image.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button onClick={handleSaveToLibrary} disabled={!jobResult || savedToLibrary} className="gap-2">
              <Check className="w-4 h-4" /> {savedToLibrary ? 'Accepted' : 'Accept'}
            </Button>
            <Button onClick={() => setJobResult(null)} disabled={!jobResult} variant="outline" className="gap-2">
              <RotateCcw className="w-4 h-4" /> Regenerate
            </Button>
            <Button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} variant="outline" className="gap-2">
              <Wand2 className="w-4 h-4" /> Edit
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      {isAdmin && jobResult && (
        <button
          onClick={handleFidelityConfirm}
          className={cn(
            'w-full flex items-center gap-3 p-3.5 rounded-lg border text-left transition-all',
            fidelityConfirmed ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-accent/30'
          )}
        >
          {fidelityConfirmed
            ? <CheckSquare className="w-4 h-4 text-accent shrink-0" />
            : <Square className="w-4 h-4 text-muted-foreground shrink-0" />
          }
          <div>
            <p className="text-sm font-medium">Dish fidelity confirmed</p>
            <p className="text-xs text-muted-foreground mt-0.5">Optional admin quality control</p>
          </div>
        </button>
      )}

      {jobResult?.generation_warning && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300/40 bg-amber-100/40">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">{jobResult.generation_warning}</p>
        </div>
      )}
    </motion.div>
  );
}
