import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Camera, Wand2, Film, ChevronRight, Download, 
  CheckSquare, Square, AlertTriangle, Loader2, Star,
  RotateCcw, Image as ImageIcon, Zap, Lock
} from 'lucide-react';
import { usePhaseFlags } from '@/hooks/use-phase-flags';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type RealismMode = 'safe' | 'enhanced' | 'editorial';
type StylePreset = 'clean_studio' | 'lifestyle_table' | 'premium_editorial';
type OutputMode = 'pro_photo' | 'reel';

const REALISM_MODES: { key: RealismMode; label: string; desc: string; warn?: boolean }[] = [
  { key: 'safe', label: 'Safe', desc: 'Cleanup + lighting only. Dish stays very close to original.' },
  { key: 'enhanced', label: 'Enhanced', desc: 'Mild replating, tidier presentation. Subtle transformation.' },
  { key: 'editorial', label: 'Editorial', desc: 'Strongest replating. Most polished result.', warn: true },
];

const STYLE_PRESETS: { key: StylePreset; label: string; desc: string }[] = [
  { key: 'clean_studio', label: 'Clean Studio', desc: 'White background, pure product focus' },
  { key: 'lifestyle_table', label: 'Lifestyle Table', desc: 'Natural setting, warm ambience' },
  { key: 'premium_editorial', label: 'Premium Editorial', desc: 'Dark, dramatic, high-end' },
];

function CreditBar({ used, total, label }: { used: number; total: number; label: string }) {
  const remaining = Math.max(0, total - used);
  const pct = Math.min(100, (used / total) * 100);
  const isLow = remaining <= 5;
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>{label}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden max-w-[80px]">
        <div
          className={cn('h-full rounded-full transition-all', isLow ? 'bg-destructive' : 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('font-medium', isLow ? 'text-destructive' : 'text-foreground')}>
        {remaining} left
      </span>
    </div>
  );
}

export default function EditorPage() {
  const { user } = useAuth();
  const { currentVenue, isAdmin } = useVenue();
  const { toast } = useToast();
  const phaseFlags = usePhaseFlags();
  // Phase 1: video is always coming soon for users
  const videoEnabled = phaseFlags.video_enabled;

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Job config state
  const [realismMode, setRealismMode] = useState<RealismMode>('safe');
  const [stylePreset, setStylePreset] = useState<StylePreset>('clean_studio');
  const [outputMode, setOutputMode] = useState<OutputMode | null>(null);
  const [hookText, setHookText] = useState('');

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [jobResult, setJobResult] = useState<{
    final_image_url: string;
    final_image_variants: Record<string, string>;
    final_video_url: string | null;
  } | null>(null);
  const [fidelityConfirmed, setFidelityConfirmed] = useState(false);

  // Credits state (mock for now, wire to DB later)
  const [usage] = useState({ pro_photo_used: 3, reel_used: 1 });
  const [limits] = useState({ monthly_pro_photo_credits: 50, monthly_reel_credits: 20 });

  const handleFileDrop = useCallback(async (file: File) => {
    if (!currentVenue || !user) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please upload an image file.' });
      return;
    }

    setUploadedFile(file);
    setUploadedPreview(URL.createObjectURL(file));
    setUploading(true);
    setJobResult(null);
    setJobId(null);
    setFidelityConfirmed(false);

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `venues/${currentVenue.id}/editor/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('venue-assets')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('venue-assets').getPublicUrl(path);
      setUploadedUrl(urlData.publicUrl);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
      setUploadedPreview(null);
      setUploadedFile(null);
    } finally {
      setUploading(false);
    }
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
    if (!currentVenue || !user || !uploadedUrl) return;
    // Hard gate: never allow reel/video in Phase 1
    if (outputMode === 'reel' && !videoEnabled) {
      toast({ title: 'Coming in Phase 2', description: 'Video reels are not available yet.' });
      return;
    }
    if (outputMode === 'reel' && !jobResult) return;

    const creditType = outputMode === 'reel' ? 'reel_used' : 'pro_photo_used';
    const creditLimit = outputMode === 'reel' ? limits.monthly_reel_credits : limits.monthly_pro_photo_credits;
    if (usage[creditType] >= creditLimit) {
      toast({ variant: 'destructive', title: 'Credit limit reached', description: 'Contact admin to increase credits.' });
      return;
    }

    setGenerating(true);
    try {
      let currentJobId = jobId;

      if (outputMode === 'pro_photo' || !currentJobId) {
        // Create a new editor_job record
        const { data: newJob, error: createError } = await supabase
          .from('editor_jobs')
          .insert({
            venue_id: currentVenue.id,
            created_by: user.id,
            status: 'queued',
            mode: outputMode || 'pro_photo',
            realism_mode: realismMode,
            style_preset: stylePreset,
            input_image_url: uploadedUrl,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        currentJobId = newJob.id;
        setJobId(currentJobId);
      }

      // Call the appropriate edge function
      const fnName = outputMode === 'reel' ? 'editor-generate-reel' : 'editor-generate-pro-photo';
      const payload = outputMode === 'reel'
        ? { job_id: currentJobId, venue_id: currentVenue.id, hook_text: hookText, cinematic_mode: false }
        : { job_id: currentJobId, venue_id: currentVenue.id, input_image_url: uploadedUrl, realism_mode: realismMode, style_preset: stylePreset };

      const { data, error: fnError } = await supabase.functions.invoke(fnName, { body: payload });
      if (fnError) throw fnError;

      // Fetch updated job
      const { data: updatedJob } = await supabase
        .from('editor_jobs')
        .select('final_image_url, final_image_variants, final_video_url')
        .eq('id', currentJobId!)
        .single();

      if (updatedJob?.final_image_url) {
        setJobResult({
          final_image_url: updatedJob.final_image_url,
          final_image_variants: (updatedJob.final_image_variants as Record<string, string>) || {},
          final_video_url: updatedJob.final_video_url || null,
        });
      }

      toast({
        title: outputMode === 'reel' ? 'Reel queued' : 'Pro Photo generated',
        description: outputMode === 'reel'
          ? 'Your reel is being prepared. Template renderer is active.'
          : 'Your professional image is ready.',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err.message });
    } finally {
      setGenerating(false);
    }
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

  const handleReset = () => {
    setUploadedFile(null);
    setUploadedUrl(null);
    setUploadedPreview(null);
    setJobId(null);
    setJobResult(null);
    setFidelityConfirmed(false);
    setOutputMode(null);
    setHookText('');
  };

  // canGenerate: never allow reel in Phase 1
  const canGenerate = uploadedUrl && !uploading && outputMode && !generating && (outputMode !== 'reel' || videoEnabled);
  const hasProPhoto = !!jobResult?.final_image_url;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto space-y-6"
    >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Camera className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-medium">Editor</h1>
                <p className="text-sm text-muted-foreground">Pulse · Hospitality Edition</p>
              </div>
            </div>
            <p className="text-muted-foreground max-w-xl">
              Turn staff photos into professional, on-brand marketing visuals.
            </p>
          </div>
          {jobResult && (
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
              <RotateCcw className="w-4 h-4" /> New Job
            </Button>
          )}
        </div>

        {/* Credits */}
        <div className="flex items-center gap-6 px-4 py-2.5 rounded-lg bg-muted/30 border border-border/50 w-fit">
          <CreditBar used={usage.pro_photo_used} total={limits.monthly_pro_photo_credits} label="Pro Photo" />
          {videoEnabled && (
            <>
              <div className="w-px h-4 bg-border" />
              <CreditBar used={usage.reel_used} total={limits.monthly_reel_credits} label="Reel" />
            </>
          )}
          {!videoEnabled && (
            <span className="text-xs text-muted-foreground ml-2 border-l border-border pl-4 flex items-center gap-1">
              <Film className="w-3 h-3" /> Video: Phase 2
            </span>
          )}
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: 3-step flow */}
          <div className="lg:col-span-2 space-y-4">

            {/* Step 1: Upload */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">1</span>
                <span className="font-medium text-sm">Upload Dish Photo</span>
              </div>

              {uploadedPreview ? (
                <div className="relative group">
                  <img
                    src={uploadedPreview}
                    alt="Uploaded dish"
                    className="w-full aspect-square object-cover rounded-lg border border-border"
                  />
                  {uploading && (
                    <div className="absolute inset-0 rounded-lg bg-background/70 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-accent" />
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-md px-2 py-1 text-xs font-medium"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <div
                  onDrop={onDropZone}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'border-2 border-dashed rounded-lg aspect-square flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
                    isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50 hover:bg-muted/30'
                  )}
                >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Drop photo here</p>
                    <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
                  </div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileInput} />
            </div>

            {/* Step 2: Output mode */}
            <div className={cn('rounded-xl border bg-card p-5 space-y-4 transition-opacity', !uploadedUrl || uploading ? 'opacity-40 pointer-events-none' : '')}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">2</span>
                <span className="font-medium text-sm">Choose Output</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setOutputMode('pro_photo')}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-left',
                    outputMode === 'pro_photo'
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/40'
                  )}
                >
                  <Wand2 className={cn('w-6 h-6', outputMode === 'pro_photo' ? 'text-accent' : 'text-muted-foreground')} />
                  <div>
                    <p className="text-sm font-semibold">Pro Photo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Professional replate</p>
                  </div>
                </button>
                {/* Reel card — Phase 1: coming soon; Phase 2: enabled */}
                <button
                  onClick={() => {
                    if (!videoEnabled) {
                      toast({ title: 'Coming in Phase 2', description: 'Video reels are a Phase 2 feature. Images and copy are live now!' });
                      return;
                    }
                    if (hasProPhoto) setOutputMode('reel');
                  }}
                  className={cn(
                    'relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-left',
                    !videoEnabled
                      ? 'border-border/40 opacity-60 cursor-pointer'
                      : !hasProPhoto
                      ? 'opacity-40 cursor-not-allowed border-border'
                      : outputMode === 'reel'
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/40'
                  )}
                >
                  {!videoEnabled && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      Phase 2
                    </span>
                  )}
                  <Film className={cn('w-6 h-6', outputMode === 'reel' ? 'text-accent' : 'text-muted-foreground')} />
                  <div>
                    <p className="text-sm font-semibold">Make Reel</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {!videoEnabled ? 'Coming soon' : hasProPhoto ? '5–8s vertical' : 'Needs Pro Photo first'}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Step 3: Quality + Style */}
            <div className={cn('rounded-xl border bg-card p-5 space-y-5 transition-opacity', !outputMode ? 'opacity-40 pointer-events-none' : '')}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">3</span>
                <span className="font-medium text-sm">
                  {outputMode === 'reel' ? 'Reel Options' : 'Quality & Style'}
                </span>
              </div>

              {outputMode !== 'reel' && (
                <>
                  {/* Realism slider */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Realism Mode</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {REALISM_MODES.map((m) => (
                        <button
                          key={m.key}
                          onClick={() => setRealismMode(m.key)}
                          className={cn(
                            'p-2.5 rounded-lg border text-center transition-all',
                            realismMode === m.key
                              ? 'border-accent bg-accent/10'
                              : 'border-border hover:border-accent/30'
                          )}
                        >
                          <p className="text-xs font-semibold">{m.label}</p>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {REALISM_MODES.find(m => m.key === realismMode)?.desc}
                    </p>
                    {realismMode === 'editorial' && (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                        <p className="text-xs text-destructive">Review to ensure the dish still represents reality.</p>
                      </div>
                    )}
                  </div>

                  {/* Style presets */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Style Preset</Label>
                    <div className="space-y-1.5">
                      {STYLE_PRESETS.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => setStylePreset(p.key)}
                          className={cn(
                            'w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all',
                            stylePreset === p.key
                              ? 'border-accent bg-accent/10'
                              : 'border-border hover:border-accent/30'
                          )}
                        >
                          <Star className={cn('w-3.5 h-3.5 shrink-0', stylePreset === p.key ? 'text-accent' : 'text-muted-foreground')} />
                          <div>
                            <p className="text-xs font-semibold">{p.label}</p>
                            <p className="text-xs text-muted-foreground">{p.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Reel options */}
              {outputMode === 'reel' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Hook Line (optional)</Label>
                    <Input
                      value={hookText}
                      onChange={(e) => setHookText(e.target.value)}
                      placeholder="e.g. Taste the difference"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">Short text overlay on the reel</p>
                  </div>

                  {/* Reel type */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Render Mode</Label>
                    <div className="p-3 rounded-lg border border-border bg-muted/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="w-3.5 h-3.5 text-accent" />
                        <span className="text-xs font-semibold">Template Reel (5–8s)</span>
                        <Badge variant="secondary" className="text-[10px]">Active</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Ken Burns zoom/pan. No AI required. Fast and cost-efficient.</p>
                    </div>
                    <div className="p-3 rounded-lg border border-border/50 bg-muted/10 opacity-50">
                      <div className="flex items-center gap-2 mb-1">
                        <Film className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground">Cinematic AI Reel</span>
                        <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Powered by Kling. Premium credit-based feature.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Generate button */}
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                ) : outputMode === 'reel' ? (
                  <><Film className="w-4 h-4" /> Make Reel</>
                ) : (
                  <><Wand2 className="w-4 h-4" /> Generate Pro Photo</>
                )}
              </Button>
            </div>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {!jobResult ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[400px] rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-4 text-center p-8"
                >
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Your result will appear here</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">Upload a photo and generate to see the transformation</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* Side by side comparison */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Original</p>
                      <img
                        src={uploadedPreview!}
                        alt="Original"
                        className="w-full aspect-square object-cover rounded-lg border border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pro Photo</p>
                        <Badge className="text-[10px] bg-accent/20 text-accent border-accent/30">AI</Badge>
                      </div>
                      <img
                        src={jobResult.final_image_url}
                        alt="Pro Photo"
                        className="w-full aspect-square object-cover rounded-lg border border-accent/20"
                      />
                    </div>
                  </div>

                  {/* Fidelity confirmation (admin only) */}
                  {isAdmin && (
                    <button
                      onClick={handleFidelityConfirm}
                      className={cn(
                        'w-full flex items-center gap-3 p-3.5 rounded-lg border text-left transition-all',
                        fidelityConfirmed
                          ? 'border-accent/40 bg-accent/5'
                          : 'border-border hover:border-accent/30'
                      )}
                    >
                      {fidelityConfirmed
                        ? <CheckSquare className="w-4 h-4 text-accent shrink-0" />
                        : <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                      <div>
                        <p className="text-sm font-medium">This image still represents the actual dish</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Fidelity confirmation — required before publishing</p>
                      </div>
                    </button>
                  )}

                  {/* Low fidelity warning */}
                  {!fidelityConfirmed && realismMode === 'editorial' && isAdmin && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <p className="text-sm text-destructive">Consider regenerating using Safe mode to better represent the actual dish.</p>
                    </div>
                  )}

                  {/* Download options */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Download</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Square', key: 'square_1_1', ratio: '1:1' },
                        { label: 'Portrait', key: 'portrait_4_5', ratio: '4:5' },
                        { label: 'Vertical', key: 'vertical_9_16', ratio: '9:16' },
                      ].map((fmt) => (
                        <a
                          key={fmt.key}
                          href={jobResult.final_image_variants[fmt.key] || jobResult.final_image_url}
                          download={`pro-photo-${fmt.key}.jpg`}
                          className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all text-center"
                        >
                          <Download className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs font-medium">{fmt.label}</span>
                          <span className="text-[10px] text-muted-foreground">{fmt.ratio}</span>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Reel result */}
                  {outputMode === 'reel' && (
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Reel</p>
                        <Badge variant="secondary" className="text-[10px]">Template Renderer</Badge>
                      </div>
                      {jobResult.final_video_url ? (
                        <div className="space-y-2">
                          <video src={jobResult.final_video_url} controls className="w-full rounded-lg" />
                          <a
                            href={jobResult.final_video_url}
                            download="reel.mp4"
                            className="flex items-center gap-2 text-sm text-accent hover:underline"
                          >
                            <Download className="w-4 h-4" /> Download reel (9:16)
                          </a>
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg bg-muted/30 border border-border text-center">
                          <Film className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Reel queued. Template renderer will generate your 5–8s vertical video.</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Connect a renderer in Platform Admin → Integrations to activate.</p>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
  );
}
