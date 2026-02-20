import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Plug, KeyRound, Eye, EyeOff, Save, CheckCircle, 
  XCircle, ChevronDown, ChevronUp, BookOpen, Film, 
  Wand2, Scissors, Clapperboard
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

const INTEGRATION_CONFIGS = [
  {
    key: 'GEMINI_IMAGE_API_KEY',
    label: 'Gemini Image Editing',
    subtitle: 'Replate / Pro Photo polish',
    icon: Wand2,
    placeholder: 'AIza...',
    howTo: [
      'Sign up at Google AI Studio (aistudio.google.com)',
      'Create a new API key in the API Keys section.',
      'Enable the Gemini API for your project.',
      'Paste the key here.',
    ],
    powers: "Powers the Safe / Enhanced / Editorial replating step in the Editor.",
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    key: 'PHOTOROOM_API_KEY',
    label: 'PhotoRoom',
    subtitle: 'Background removal',
    icon: Scissors,
    placeholder: 'sk_...',
    howTo: [
      'Create a PhotoRoom developer account at app.photoroom.com/developers.',
      'Navigate to API Keys and generate a new key.',
      'Paste the key here.',
    ],
    powers: "Creates clean dish cutouts before replating — reduces AI drift and improves realism.",
    docsUrl: 'https://www.photoroom.com/api/',
  },
  {
    key: 'REEL_RENDERER_PROVIDER',
    label: 'Reel Renderer',
    subtitle: 'Template video generation',
    icon: Film,
    placeholder: 'placeholder',
    isProvider: true,
    providerOptions: ['placeholder', 'shotstack', 'cloudinary', 'ffmpeg'],
    howTo: [
      'For V1, the placeholder renderer is active — no setup needed.',
      'To use Shotstack: sign up at shotstack.io, get an API key, set provider to "shotstack".',
      'To use Cloudinary: set up a Cloudinary account, enable video transformations, set provider to "cloudinary".',
      'To use self-hosted FFmpeg: deploy an FFmpeg worker and set provider to "ffmpeg".',
    ],
    powers: "Powers Make Reel (5–8s) without cinematic AI. Ken Burns zoom/pan template.",
    docsUrl: 'https://shotstack.io/docs/',
  },
  {
    key: 'KLING_API_KEY',
    label: 'Kling',
    subtitle: 'Cinematic AI Reels (optional)',
    icon: Clapperboard,
    placeholder: 'kling_...',
    optional: true,
    howTo: [
      'Kling is only needed for Cinematic AI Reels (premium, credit-based feature).',
      'Leave empty to use template reels instead.',
      'When ready, sign up at klingai.com, generate an API key, and paste it here.',
    ],
    powers: "Optional — enables Cinematic AI Reel generation via Kling. Coming soon in Editor.",
    docsUrl: 'https://klingai.com/',
  },
];

export default function AdminIntegrations() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedHelp, setExpandedHelp] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('platform_settings')
      .select('*');

    if (error) {
      toast({ variant: 'destructive', title: 'Error loading settings', description: error.message });
    } else {
      const map: Record<string, string> = {};
      (data as Setting[]).forEach((s) => { map[s.key] = s.value; });
      setSettings(map);
      setEditValues(map);
    }
    setLoading(false);
  };

  const handleSave = async (key: string) => {
    const value = editValues[key] ?? '';
    setSaving(key);
    const { error } = await supabase
      .from('platform_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    setSaving(null);
    if (error) {
      toast({ variant: 'destructive', title: 'Save failed', description: error.message });
    } else {
      setSettings(prev => ({ ...prev, [key]: value }));
      toast({ title: 'Saved', description: `${key} updated.` });
    }
  };

  const isConfigured = (key: string) => {
    const val = settings[key] ?? '';
    if (key === 'REEL_RENDERER_PROVIDER') return val.length > 0;
    return val.trim().length > 0;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-3xl mx-auto space-y-6"
      >
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Plug className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-medium">Integrations & API Keys</h1>
              <p className="text-sm text-muted-foreground">Platform Admin only</p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-xl">
            Connect external services to power the Editor module. Add API keys when you're ready — 
            the UI works with placeholders until then.
          </p>
        </div>

        {/* Warning */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 text-sm">
          <KeyRound className="w-3.5 h-3.5 text-destructive" />
          <span className="text-destructive font-medium">Admin Only</span>
          <span className="text-muted-foreground">• Keys stored securely in platform settings</span>
        </div>

        {/* Integration cards */}
        <div className="space-y-4">
          {INTEGRATION_CONFIGS.map((cfg) => {
            const configured = isConfigured(cfg.key);
            const helpOpen = expandedHelp === cfg.key;
            const Icon = cfg.icon;

            return (
              <Card key={cfg.key} className="border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{cfg.label}</CardTitle>
                          {cfg.optional && (
                            <Badge variant="outline" className="text-[10px]">Optional</Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs">{cfg.subtitle}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {configured ? (
                        <Badge className="gap-1 bg-accent/20 text-accent border-accent/30 text-[11px]">
                          <CheckCircle className="w-3 h-3" /> Configured
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1 text-[11px]">
                          <XCircle className="w-3 h-3" /> Not set
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Key input */}
                  {cfg.isProvider ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Provider</Label>
                      <div className="flex gap-2">
                        <select
                          value={editValues[cfg.key] ?? 'placeholder'}
                          onChange={(e) => setEditValues(prev => ({ ...prev, [cfg.key]: e.target.value }))}
                          className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                          {cfg.providerOptions?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          onClick={() => handleSave(cfg.key)}
                          disabled={saving === cfg.key}
                          className="gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {saving === cfg.key ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">API Key</Label>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            type={visible[cfg.key] ? 'text' : 'password'}
                            value={editValues[cfg.key] ?? ''}
                            onChange={(e) => setEditValues(prev => ({ ...prev, [cfg.key]: e.target.value }))}
                            placeholder={cfg.placeholder}
                            className="pr-10 font-mono text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setVisible(prev => ({ ...prev, [cfg.key]: !prev[cfg.key] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {visible[cfg.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSave(cfg.key)}
                          disabled={saving === cfg.key}
                          className="gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {saving === cfg.key ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Powers description */}
                  <p className="text-xs text-muted-foreground">{cfg.powers}</p>

                  {/* How to connect (collapsible) */}
                  <button
                    onClick={() => setExpandedHelp(helpOpen ? null : cfg.key)}
                    className="flex items-center gap-2 text-xs text-accent hover:text-accent/80 transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    How to connect
                    {helpOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {helpOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-lg bg-muted/30 border border-border p-4 space-y-3"
                    >
                      <ol className="space-y-2">
                        {cfg.howTo.map((step, i) => (
                          <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                            <span className="font-bold text-foreground shrink-0">{i + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      <a
                        href={cfg.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                      >
                        <BookOpen className="w-3 h-3" /> Open documentation ↗
                      </a>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </motion.div>
    </AppLayout>
  );
}
