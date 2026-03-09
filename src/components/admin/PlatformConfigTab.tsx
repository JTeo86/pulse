import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { ChevronDown, Settings2, Cpu, BookOpen } from 'lucide-react';

const REVIEW_DEFAULTS: Array<{
  key: string;
  label: string;
  description: string;
  type: 'select' | 'number' | 'text';
  options?: { value: string; label: string }[];
  defaultValue: string;
}> = [
  {
    key: 'default_review_frequency',
    label: 'Default Review Frequency',
    description: 'How often to fetch and summarise reviews for a venue.',
    type: 'select',
    options: [
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'biweekly', label: 'Bi-weekly' },
      { value: 'monthly', label: 'Monthly' },
    ],
    defaultValue: 'weekly',
  },
];

const CREDIT_DEFAULTS: Array<{
  key: string;
  label: string;
  description: string;
  type: 'number';
  defaultValue: string;
}> = [
  {
    key: 'monthly_pro_photo_default',
    label: 'Pro Photo Credits / Month',
    description: 'Default credits for new venues.',
    type: 'number',
    defaultValue: '50',
  },
  {
    key: 'monthly_reel_default',
    label: 'Reel Credits / Month',
    description: 'Default video reel credits for new venues.',
    type: 'number',
    defaultValue: '20',
  },
];

const AI_DEFAULTS: Array<{
  key: string;
  label: string;
  description: string;
  type: 'number' | 'text';
  defaultValue: string;
}> = [
  {
    key: 'gemini_replate_model',
    label: 'Gemini Model',
    description: 'Model ID for Pro Photo generation. Must be image-capable (e.g. gemini-2.5-flash-image).',
    type: 'text',
    defaultValue: 'gemini-2.5-flash-image',
  },
  {
    key: 'ai_default_temperature',
    label: 'Temperature',
    description: 'LLM sampling temperature (0.0–1.0).',
    type: 'number',
    defaultValue: '0.7',
  },
  {
    key: 'ai_max_tokens',
    label: 'Max Output Tokens',
    description: 'Hard cap on tokens per generation call.',
    type: 'number',
    defaultValue: '2048',
  },
  {
    key: 'image_default_resolution',
    label: 'Image Resolution',
    description: 'Default output resolution (e.g. 1024x1024).',
    type: 'text',
    defaultValue: '1024x1024',
  },
  {
    key: 'style_strength_default',
    label: 'Style Strength',
    description: 'Default style-strength value (0–100).',
    type: 'number',
    defaultValue: '70',
  },
];

type SettingsMap = Record<string, string>;
type FieldDef = { key: string; label: string; description: string; type: string; options?: { value: string; label: string }[]; defaultValue: string };

function SettingField({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  if (field.type === 'select' && field.options) {
    return (
      <Select value={value || field.defaultValue} onValueChange={onChange}>
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      type={field.type === 'number' ? 'number' : 'text'}
      value={value ?? field.defaultValue}
      onChange={e => onChange(e.target.value)}
      className="w-52"
      placeholder={field.defaultValue}
    />
  );
}

function FieldGroup({ title, icon: Icon, description, fields, merged, onChange }: {
  title: string;
  icon: typeof Settings2;
  description: string;
  fields: FieldDef[];
  merged: SettingsMap;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {fields.map(field => (
          <div key={field.key} className="flex items-start justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <Label className="text-sm font-medium">{field.label}</Label>
              <p className="text-xs text-muted-foreground">{field.description}</p>
            </div>
            <div className="shrink-0">
              <SettingField
                field={field}
                value={merged[field.key] ?? field.defaultValue}
                onChange={v => onChange(field.key, v)}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function PlatformConfigTab() {
  const queryClient = useQueryClient();
  const [aiOpen, setAiOpen] = useState(false);

  const { data: settings, isLoading } = useQuery<SettingsMap>({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value');
      if (error) throw error;
      const map: SettingsMap = {};
      (data ?? []).forEach(row => { map[row.key] = row.value; });
      return map;
    },
  });

  const [local, setLocal] = useState<SettingsMap>({});
  const merged: SettingsMap = { ...(settings ?? {}), ...local };

  const saveMutation = useMutation({
    mutationFn: async (kvs: SettingsMap) => {
      const rows = Object.entries(kvs).map(([key, value]) => ({ key, value }));
      for (const row of rows) {
        const { error } = await supabase
          .from('platform_settings')
          .upsert({ key: row.key, value: row.value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      setLocal({});
      toast.success('Product defaults saved');
    },
    onError: (err) => toast.error('Failed: ' + (err as Error).message),
  });

  const handleChange = (key: string, value: string) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  };

  const isDirty = Object.keys(local).length > 0;

  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <FieldGroup
        title="Review Defaults"
        icon={BookOpen}
        description="Settings for automated review ingestion and reporting."
        fields={REVIEW_DEFAULTS}
        merged={merged}
        onChange={handleChange}
      />

      <FieldGroup
        title="Credit Defaults"
        icon={Settings2}
        description="Default monthly credits for new venues."
        fields={CREDIT_DEFAULTS}
        merged={merged}
        onChange={handleChange}
      />

      {/* AI Defaults — collapsible */}
      <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-base">AI Defaults</CardTitle>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">Internal</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
              </div>
              <CardDescription>
                Gemini model selection and generation parameters. Not visible to users.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-5 pt-0">
              <Separator />
              {AI_DEFAULTS.map(field => (
                <div key={field.key} className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <Label className="text-sm font-medium">{field.label}</Label>
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  </div>
                  <Input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={merged[field.key] ?? field.defaultValue}
                    onChange={e => handleChange(field.key, e.target.value)}
                    className="w-52 shrink-0"
                    placeholder={field.defaultValue}
                  />
                </div>
              ))}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Save bar */}
      {isDirty && (
        <div className="flex items-center justify-between p-4 rounded-lg border border-accent/30 bg-accent/5">
          <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocal({})}>Discard</Button>
            <Button size="sm" onClick={() => saveMutation.mutate(local)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
