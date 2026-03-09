import { useState, useEffect, useCallback } from 'react';
import {
  KeyRound, Eye, EyeOff, Save, CheckCircle2,
  XCircle, AlertCircle, Clock, RefreshCw,
  Activity, FlaskConical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  getPlatformKeys, updatePlatformKey,
  type PlatformApiKey, type HealthStatus, type KeyCategory,
} from '@/lib/platform-keys';

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORY_ORDER: KeyCategory[] = ['Reviews', 'Editor', 'Video', 'Publishing'];
const CATEGORY_META: Record<KeyCategory, { label: string; description: string }> = {
  Reviews:    { label: 'Reviews & Reputation',  description: 'Keys for ingesting Google, OpenTable and TripAdvisor reviews via SerpAPI.' },
  Editor:     { label: 'AI / Creative',          description: 'Gemini powers Pro Photo image generation and creative AI features.' },
  Video:      { label: 'Video / Reels',          description: 'Kling AI for video generation from images. Configure when ready.' },
  Publishing: { label: 'Publishing',             description: 'Buffer for future direct social media scheduling.' },
  Other:      { label: 'Other',                  description: 'Miscellaneous platform credentials.' },
};

// ─── Health badge ─────────────────────────────────────────────────────────────
function HealthBadge({ status, lastChecked, lastError }: {
  status: HealthStatus;
  lastChecked: string | null;
  lastError: string | null;
}) {
  const config = {
    healthy:  { icon: CheckCircle2, label: 'Healthy',  cls: 'bg-success/10 text-success border-success/20' },
    invalid:  { icon: XCircle,       label: 'Invalid',  cls: 'bg-destructive/10 text-destructive border-destructive/20' },
    missing:  { icon: AlertCircle,   label: 'Missing',  cls: 'bg-warning/10 text-warning border-warning/20' },
    untested: { icon: Clock,         label: 'Untested', cls: 'bg-muted text-muted-foreground border-border' },
  }[status] ?? { icon: Clock, label: 'Untested', cls: 'bg-muted text-muted-foreground border-border' };
  const Icon = config.icon;
  const tooltipLines: string[] = [];
  if (lastChecked) tooltipLines.push(`Last checked: ${new Date(lastChecked).toLocaleString()}`);
  if (lastError)   tooltipLines.push(`Error: ${lastError}`);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 text-[11px] cursor-default select-none ${config.cls}`}>
            <Icon className="w-3 h-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        {tooltipLines.length > 0 && (
          <TooltipContent side="top" className="max-w-xs space-y-1 text-xs">
            {tooltipLines.map((l, i) => <p key={i}>{l}</p>)}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Category summary badge ───────────────────────────────────────────────────
function CategorySummary({ keys }: { keys: PlatformApiKey[] }) {
  const required    = keys.filter(k => k.is_required);
  const hasInvalid  = required.some(k => k.health_status === 'invalid');
  const hasMissing  = required.some(k => k.health_status === 'missing' || !k.is_configured);
  const hasUntested = keys.some(k => k.health_status === 'untested' && k.is_configured);
  const allHealthy  = keys.filter(k => k.is_configured).every(k => k.health_status === 'healthy');
  if (hasInvalid)  return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1 text-[10px]"><XCircle className="w-2.5 h-2.5" />Issue</Badge>;
  if (hasMissing)  return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1 text-[10px]"><AlertCircle className="w-2.5 h-2.5" />Incomplete</Badge>;
  if (hasUntested) return <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1 text-[10px]"><Clock className="w-2.5 h-2.5" />Untested</Badge>;
  if (allHealthy && keys.some(k => k.is_configured)) return <Badge variant="outline" className="bg-success/10 text-success border-success/20 gap-1 text-[10px]"><CheckCircle2 className="w-2.5 h-2.5" />Healthy</Badge>;
  return <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1 text-[10px]"><Clock className="w-2.5 h-2.5" />Not set</Badge>;
}

// ─── SerpAPI Test ─────────────────────────────────────────────────────────────
function SerpApiTestButton() {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke('test-serpapi-key', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (resp.error) throw new Error(resp.error.message);
      setResult(resp.data as Record<string, unknown>);
    } catch (err) {
      toast({ title: 'Test failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="gap-1.5">
        <FlaskConical className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
        {testing ? 'Testing…' : 'Test SerpAPI Key'}
      </Button>
      {result && (
        <div className="text-xs bg-muted rounded-lg p-3 space-y-1 font-mono">
          {result.key_found ? (
            <>
              <p>Key detected (length {String(result.key_length)}): <strong>{String(result.key_preview)}</strong></p>
              {result.had_whitespace && <p className="text-warning">⚠ Whitespace was trimmed from stored key.</p>}
              <p>SerpAPI status: <strong>{String(result.serpapi_status)}</strong></p>
              <p className={result.serpapi_status === 200 ? 'text-accent' : 'text-destructive'}>{String(result.serpapi_message)}</p>
            </>
          ) : (
            <p className="text-destructive">{String(result.message || 'Key missing in runtime')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Gemini Test ──────────────────────────────────────────────────────────────
function GeminiTestButton() {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: modelSetting } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'gemini_replate_model')
        .single();
      const model = (modelSetting?.value || 'gemini-2.5-flash-image').replace(/^google\//, '');
      const resp = await supabase.functions.invoke('check-key-health', {
        body: { key_name: 'GEMINI_IMAGE_API_KEY', test_gemini_replate: true, gemini_model: model },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (resp.error) throw new Error(resp.error.message);
      setResult(resp.data as Record<string, unknown>);
    } catch (err) {
      toast({ title: 'Test failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="gap-1.5">
        <FlaskConical className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
        {testing ? 'Testing Gemini…' : 'Test Gemini (Image)'}
      </Button>
      {result && (
        <div className="text-xs bg-muted rounded-lg p-3 space-y-1 font-mono">
          <p>Model: <strong>{String(result.model || 'unknown')}</strong></p>
          <p className={result.status === 'healthy' ? 'text-accent' : 'text-destructive'}>
            {String(result.message || 'No response')}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Single key row ───────────────────────────────────────────────────────────
function KeyRow({ apiKey, onSaved }: { apiKey: PlatformApiKey; onSaved: () => void }) {
  const { toast } = useToast();
  const [value,    setValue]    = useState(apiKey.key_value ?? '');
  const [visible,  setVisible]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePlatformKey(apiKey.key_name, value);
      toast({ title: 'Saved', description: `${apiKey.key_name} updated.` });
      onSaved();
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await supabase.functions.invoke('check-key-health', {
        body: { key_name: apiKey.key_name },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const result = resp.data as { status: HealthStatus; message: string } | null;
      if (resp.error || !result) throw new Error(resp.error?.message ?? 'Health check failed');
      toast({
        title: result.status === 'healthy' ? '✅ Healthy' : result.status === 'invalid' ? '❌ Invalid' : '⚠️ Missing',
        description: result.message,
        variant: result.status === 'healthy' ? 'default' : 'destructive',
      });
      onSaved();
    } catch (err) {
      toast({ title: 'Check failed', description: (err as Error).message, variant: 'destructive' });
    } finally { setChecking(false); }
  };

  const isDirty   = value !== (apiKey.key_value ?? '');
  const inputType = apiKey.is_secret && !visible ? 'password' : 'text';
  const isSerpApi = apiKey.key_name === 'SERPAPI_API_KEY';
  const isGemini  = apiKey.key_name === 'GEMINI_IMAGE_API_KEY';

  return (
    <div className="flex flex-col gap-2 py-4 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-medium">{apiKey.key_name}</span>
            {apiKey.is_required && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-accent/40 text-accent">Required</Badge>
            )}
          </div>
          {apiKey.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{apiKey.description}</p>
          )}
        </div>
        <HealthBadge status={apiKey.health_status as HealthStatus} lastChecked={apiKey.last_checked_at} lastError={apiKey.last_error} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Label htmlFor={apiKey.id} className="sr-only">{apiKey.key_name}</Label>
          <Input
            id={apiKey.id}
            type={inputType}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={apiKey.is_secret ? '••••••••••' : 'Enter value…'}
            className="pr-10 font-mono text-sm"
          />
          {apiKey.is_secret && (
            <button
              type="button"
              onClick={() => setVisible(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving || !isDirty} className="gap-1.5 shrink-0" variant={isDirty ? 'default' : 'outline'}>
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleCheck} disabled={checking} className="gap-1.5 shrink-0">
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking…' : 'Check'}
        </Button>
      </div>
      {isSerpApi && <SerpApiTestButton />}
      {isGemini && <GeminiTestButton />}
    </div>
  );
}

// ─── Exported content component ───────────────────────────────────────────────
export default function AdminIntegrationsContent() {
  const { toast } = useToast();
  const [keys,    setKeys]    = useState<PlatformApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await getPlatformKeys();
      setKeys(data);
    } catch (err) {
      toast({ title: 'Error loading keys', description: (err as Error).message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const byCategory = keys.reduce((acc, k) => {
    const cat = k.category as KeyCategory;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(k);
    return acc;
  }, {} as Record<KeyCategory, PlatformApiKey[]>);

  const totalHealthy  = keys.filter(k => k.health_status === 'healthy').length;
  const totalMissing  = keys.filter(k => k.is_required && (!k.is_configured || k.health_status === 'missing')).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-3xl">
        {/* Health Overview */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <CardTitle className="text-base">Integrations Health</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{keys.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Active Keys</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-success">{totalHealthy}</div>
                <div className="text-xs text-muted-foreground mt-1">Healthy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">{totalMissing}</div>
                <div className="text-xs text-muted-foreground mt-1">Required Missing</div>
              </div>
            </div>
            <Separator className="mb-4" />
            <div className="flex flex-wrap gap-4">
              {CATEGORY_ORDER.map(cat => {
                const catKeys = byCategory[cat] ?? [];
                if (!catKeys.length) return null;
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{CATEGORY_META[cat].label}:</span>
                    <CategorySummary keys={catKeys} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Category sections */}
        {CATEGORY_ORDER.map(cat => {
          const catKeys = byCategory[cat] ?? [];
          if (!catKeys.length) return null;
          const meta = CATEGORY_META[cat];
          return (
            <Card key={cat} className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                  </div>
                  <CategorySummary keys={catKeys} />
                </div>
                <CardDescription className="text-xs">{meta.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {catKeys.map(k => (
                  <KeyRow key={k.id} apiKey={k} onSaved={fetchKeys} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
