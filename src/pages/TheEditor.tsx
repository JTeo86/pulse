import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Camera, Wand2, Film, Download,
  CheckSquare, Square, AlertTriangle, Loader2, Star,
  RotateCcw, Image as ImageIcon, Info, ChevronDown, ChevronRight,
  Eraser, Replace, Sparkles, Crop
} from 'lucide-react';
import { usePhaseFlags } from '@/hooks/use-phase-flags';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type RealismMode = 'safe' | 'enhanced' | 'editorial';

const REALISM_MODES: { key: RealismMode; label: string; desc: string; warn?: boolean }[] = [
  { key: 'safe', label: 'Safe', desc: 'Cleanup + lighting only. Dish stays very close to original.' },
  { key: 'enhanced', label: 'Enhanced', desc: 'Mild replating, tidier presentation.' },
  { key: 'editorial', label: 'Editorial', desc: 'Strongest replating. Most polished.', warn: true },
];

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

export default function TheEditorPage() {
  const { user } = useAuth();
  const { currentVenue, isAdmin } = useVenue();
  const { toast } = useToast();
  const phaseFlags = usePhaseFlags();
  const videoEnabled = phaseFlags.video_enabled;

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [realismMode, setRealismMode] = useState<RealismMode>('safe');
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<{
    composed_url: string | null;
    final_image_url: string;
    final_image_variants: Record<string, string>;
    gemini_used: boolean;
    background_source: string;
    replate_skip_reason?: string | null;
  } | null>(null);
  const [fidelityConfirmed, setFidelityConfirmed] = useState(false);
  const [manualToolsOpen, setManualToolsOpen] = useState(false);

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
    setJobResult(null);
    setJobId(null);
    setFidelityConfirmed(false);
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
    if (usage.pro_photo_used >= limits.monthly_pro_photo_credits) {
      toast({ variant: 'destructive', title: 'Credit limit reached', description: 'Contact admin to increase credits.' });
      return;
    }

    setGenerating(true);
    try {
      const base64 = await fileToBase64(uploadedFile);

      const { data: newJob, error: createError } = await supabase
        .from('editor_jobs')
        .insert({
          venue_id: currentVenue.id,
          created_by: user.id,
          status: 'queued',
          mode: 'pro_photo',
          realism_mode: realismMode,
          style_preset: 'clean_studio',
        })
        .select('id')
        .single();

      if (createError) throw createError;
      setJobId(newJob.id);

      const { data, error: fnError } = await supabase.functions.invoke('editor-generate-pro-photo', {
        body: {
          job_id: newJob.id,
          venue_id: currentVenue.id,
          sourceFileBase64: base64,
          sourceFileName: uploadedFile.name,
          realism_mode: realismMode,
          style_preset: 'clean_studio',
        },
      });
      if (fnError) throw fnError;

      if (data?.final_image_url) {
        setJobResult({
          composed_url: data.composed_url || null,
          final_image_url: data.final_image_url,
          final_image_variants: (data.final_image_variants as Record<string, string>) || {},
          gemini_used: data.gemini_used || false,
          background_source: data.background_source || 'unknown',
          replate_skip_reason: data.replate_skip_reason || null,
        });
      }

      toast({
        title: 'Pro Photo generated',
        description: `Saved to Content Library. Background: ${data?.background_source === 'atmosphere_ref' ? 'Venue Ref' : 'AI Generated'} ${data?.gemini_used ? '• AI Replated' : ''}`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err.message });
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
    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview);
    setUploadedFile(null);
    setUploadedPreview(null);
    setJobId(null);
    setJobResult(null);
    setFidelityConfirmed(false);
  };

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
              <p className="text-sm text-muted-foreground">Pulse · Pro Photo Studio</p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-xl">
            Upload a dish photo and generate a professional, on-brand marketing image in one click.
          </p>
        </div>
        {jobResult && (
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" /> New Photo
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
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Upload + Config */}
        <div className="lg:col-span-2 space-y-4">

          {/* Upload */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">1</span>
              <span className="font-medium text-sm">Upload Dish Photo</span>
            </div>

            {uploadedPreview ? (
              <div className="relative group">
                <img src={uploadedPreview} alt="Uploaded dish" className="w-full aspect-square object-cover rounded-lg border border-border" />
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

          {/* Realism mode */}
          <div className={cn('rounded-xl border bg-card p-5 space-y-4 transition-opacity', !uploadedFile ? 'opacity-40 pointer-events-none' : '')}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">2</span>
              <span className="font-medium text-sm">Realism Mode</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {REALISM_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setRealismMode(m.key)}
                  className={cn(
                    'p-2.5 rounded-lg border text-left transition-all',
                    realismMode === m.key ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/30'
                  )}
                >
                  <p className="text-xs font-semibold flex items-center gap-1">
                    {m.label}
                    {m.warn && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{m.desc}</p>
                </button>
              ))}
            </div>

            {/* Generate CTA */}
            <Button
              onClick={handleGenerate}
              disabled={!uploadedFile || generating}
              className="w-full gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
              size="lg"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              ) : (
                <><Wand2 className="w-4 h-4" /> Generate Pro Photo</>
              )}
            </Button>
          </div>

          {/* Manual tools — collapsed by default */}
          <Collapsible open={manualToolsOpen} onOpenChange={setManualToolsOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Advanced Manual Adjustments</span>
              {manualToolsOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  These tools operate on the latest generated image. Generate a Pro Photo first for best results.
                </p>
                {[
                  { icon: Eraser, label: 'Remove Background', desc: 'Transparent cutout', disabled: true },
                  { icon: Replace, label: 'Replace Background', desc: 'Custom background', disabled: true },
                  { icon: Sparkles, label: 'Enhance', desc: 'Lighting & color', disabled: true },
                  { icon: Crop, label: 'Crop & Resize', desc: 'Format for social', disabled: true },
                ].map((tool) => (
                  <button
                    key={tool.label}
                    disabled={tool.disabled}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent/30 transition-all text-left opacity-60 cursor-not-allowed"
                  >
                    <tool.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{tool.label}</p>
                      <p className="text-[10px] text-muted-foreground">{tool.desc}</p>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[9px]">Coming soon</Badge>
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
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
                {/* Side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Original</p>
                    <img src={uploadedPreview!} alt="Original" className="w-full aspect-square object-cover rounded-lg border border-border" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                        {jobResult.gemini_used ? 'Final (Pro Replated)' : 'Pro Photo'}
                      </p>
                      <Badge className="text-[10px] bg-accent/20 text-accent border-accent/30">
                        {jobResult.gemini_used ? 'AI Replated' : 'Composed'}
                      </Badge>
                    </div>
                    <img src={jobResult.final_image_url} alt="Pro Photo" className="w-full aspect-square object-cover rounded-lg border border-accent/20" />
                  </div>
                </div>

                {/* Composed intermediate */}
                {jobResult.gemini_used && jobResult.composed_url && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-medium">Composed (Background Applied)</p>
                    </div>
                    <img src={jobResult.composed_url} alt="Composed" className="w-full max-w-xs aspect-square object-cover rounded-lg border border-border" />
                  </div>
                )}

                {/* Gemini skipped note */}
                {!jobResult.gemini_used && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                    <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Pro Replate (AI polish) was skipped. {jobResult.replate_skip_reason || 'Gemini API key not found. Add GEMINI_IMAGE_API_KEY in Platform Admin.'}
                    </p>
                  </div>
                )}

                {/* Inputs Used panel */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Inputs Used</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Background:</span>
                      <span className="font-medium">
                        {jobResult.background_source === 'atmosphere_ref' ? 'Venue Atmosphere Ref' :
                         jobResult.background_source === 'ai_prompt' ? 'AI Generated' : 'Studio Default'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Provider:</span>
                      <span className="font-medium">{jobResult.gemini_used ? 'PhotoRoom + Gemini' : 'PhotoRoom'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Realism:</span>
                      <span className="font-medium capitalize">{realismMode}</span>
                    </div>
                  </div>
                </div>

                {/* Fidelity */}
                {isAdmin && (
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
                      <p className="text-sm font-medium">This image still represents the actual dish</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Fidelity confirmation — required before publishing</p>
                    </div>
                  </button>
                )}

                {!fidelityConfirmed && realismMode === 'editorial' && isAdmin && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">Consider regenerating using Safe mode to better represent the actual dish.</p>
                  </div>
                )}

                {/* Download + Send to Drafts */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Actions</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleDownload(jobResult.final_image_url, `pro-photo-${Date.now()}.jpg`)}
                      variant="default"
                      className="gap-2 flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                    >
                      <Download className="w-4 h-4" /> Download Image
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 flex-1"
                      onClick={() => toast({ title: 'Saved to Content Library', description: 'Image is available in Brand → Content Library.' })}
                    >
                      <ImageIcon className="w-4 h-4" /> Send to Drafts
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Pro Photo outputs are automatically saved to your Content Library.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
