import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const visualTypes = ['dish', 'drink', 'dessert', 'interior', 'chef/prep', 'event', 'lifestyle'];

type SetupState = {
  venueName: string;
  cuisineType: string;
  location: string;
  website: string;
  instagram: string;
  tone: string;
  audience: string;
  positioning: string;
  voiceStyle: string;
  visualStyle: string;
  contentGoals: string;
  autopilotMode: 'conservative' | 'creative';
  requireAssetForRuns: boolean;
  allowCopyOnlyFallback: boolean;
  approvalMode: 'require_approval' | 'auto_schedule';
  frequency: 'daily' | '3x_week' | 'weekly';
};

const defaultState: SetupState = {
  venueName: '',
  cuisineType: '',
  location: '',
  website: '',
  instagram: '',
  tone: '',
  audience: '',
  positioning: '',
  voiceStyle: '',
  visualStyle: '',
  contentGoals: '',
  autopilotMode: 'conservative',
  requireAssetForRuns: true,
  allowCopyOnlyFallback: false,
  approvalMode: 'require_approval',
  frequency: '3x_week',
};

export default function SetupPage() {
  const { currentVenue, refreshVenues } = useVenue();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<SetupState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assetsCount, setAssetsCount] = useState(0);

  const onboarding = searchParams.get('onboarding') === '1';

  useEffect(() => {
    if (!currentVenue) return;
    (async () => {
      const [profileRes, kitRes, settingsRes, assetsRes] = await Promise.all([
        supabase.from('venue_style_profiles').select('*').eq('venue_id', currentVenue.id).maybeSingle(),
        supabase.from('brand_kits').select('rules_text').eq('venue_id', currentVenue.id).maybeSingle(),
        supabase.from('autopilot_settings').select('*').eq('venue_id', currentVenue.id).maybeSingle(),
        supabase.from('content_assets').select('id', { count: 'exact', head: true }).eq('venue_id', currentVenue.id),
      ]);

      const rules = parseRules(kitRes.data?.rules_text);
      const city = currentVenue.city || '';
      setState({
        venueName: currentVenue.name || '',
        cuisineType: profileRes.data?.cuisine_type || '',
        location: city,
        website: currentVenue.website_url || '',
        instagram: currentVenue.instagram_handle || '',
        tone: profileRes.data?.venue_tone || '',
        audience: profileRes.data?.target_audience || '',
        positioning: profileRes.data?.brand_summary || '',
        voiceStyle: rules.voiceStyle || '',
        visualStyle: rules.visualStyle || profileRes.data?.style_summary || '',
        contentGoals: rules.contentGoals || profileRes.data?.key_selling_points || '',
        autopilotMode: 'conservative',
        requireAssetForRuns: true,
        allowCopyOnlyFallback: false,
        approvalMode: (settingsRes.data?.approval_mode as SetupState['approvalMode']) || 'require_approval',
        frequency: (settingsRes.data?.frequency as SetupState['frequency']) || '3x_week',
      });
      setAssetsCount(assetsRes.count || 0);
    })();
  }, [currentVenue?.id]);

  const completion = useMemo(() => {
    let done = 0;
    if (state.venueName && state.cuisineType && state.location) done++;
    if (state.voiceStyle && state.visualStyle && state.contentGoals) done++;
    if (assetsCount > 0) done++;
    if (state.frequency) done++;
    return Math.round((done / 4) * 100);
  }, [state, assetsCount]);

  const saveSetup = async () => {
    if (!currentVenue) return;
    setSaving(true);
    try {
      const rulesText = JSON.stringify({
        voiceStyle: state.voiceStyle,
        visualStyle: state.visualStyle,
        contentGoals: state.contentGoals,
      });

      await Promise.all([
        supabase.from('venues').update({
          name: state.venueName,
          city: state.location,
          website_url: state.website || null,
          instagram_handle: state.instagram?.replace('@', '') || null,
        }).eq('id', currentVenue.id),
        supabase.from('venue_style_profiles').upsert({
          venue_id: currentVenue.id,
          cuisine_type: state.cuisineType || null,
          venue_tone: state.tone || null,
          target_audience: state.audience || null,
          brand_summary: state.positioning || null,
          style_summary: state.visualStyle || null,
          key_selling_points: state.contentGoals || null,
        }, { onConflict: 'venue_id' }),
        supabase.from('brand_kits').upsert({
          venue_id: currentVenue.id,
          rules_text: rulesText,
          preset: 'casual',
        }, { onConflict: 'venue_id' }),
        supabase.from('autopilot_settings').upsert({
          venue_id: currentVenue.id,
          mode: state.autopilotMode,
          require_asset_for_runs: state.requireAssetForRuns,
          allow_copy_only_fallback: state.allowCopyOnlyFallback,
          approval_mode: state.approvalMode,
          frequency: state.frequency,
          is_enabled: true,
        }, { onConflict: 'venue_id' }),
      ]);

      await refreshVenues();
      toast({ title: 'Setup saved', description: 'Pulse now has what it needs to generate better content.' });
    } catch (error: any) {
      toast({ title: 'Failed to save setup', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const uploadStarterAssets = async (files: FileList | null) => {
    if (!files || !currentVenue) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `${currentVenue.id}/starter/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from('venue-assets').upload(path, file);
        if (uploadErr) throw uploadErr;

        const { data: pub } = supabase.storage.from('venue-assets').getPublicUrl(path);
        await supabase.from('content_assets').insert({
          venue_id: currentVenue.id,
          asset_type: file.type.startsWith('video') ? 'video' : 'image',
          source_type: 'upload',
          status: 'approved',
          title: file.name,
          storage_path: path,
          public_url: pub.publicUrl,
          metadata: {
            starter_upload: true,
            title: file.name,
            category: 'starter',
            tags: [],
            signature_item: false,
            evergreen: true,
            seasonal: false,
            autopilot_reusable: true,
            reuse_priority: 5,
            visual_type: 'dish',
          },
        });
      }
      setAssetsCount((c) => c + files.length);
      toast({ title: 'Assets uploaded', description: `${files.length} starter asset(s) added to your Autopilot pool.` });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHeader title="Setup" description="Give Pulse the essentials once, then let it run." />
      <div className="p-6 max-w-5xl space-y-6">
        <Card className="border-accent/30">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Setup progress
              <Badge variant="secondary">{completion}% complete</Badge>
            </CardTitle>
            <CardDescription>
              {onboarding ? 'Welcome! Complete this once and Pulse can start producing useful content immediately.' : 'Keep setup updated so Autopilot stays on-brand.'}
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs defaultValue="basics" className="space-y-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="basics">Venue</TabsTrigger>
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="assets">Asset Pool</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="autopilot">Autopilot</TabsTrigger>
          </TabsList>

          <TabsContent value="basics">
            <Card><CardContent className="pt-6 grid sm:grid-cols-2 gap-4">
              <Field label="Venue name" value={state.venueName} onChange={(v) => setState((s) => ({ ...s, venueName: v }))} />
              <Field label="Cuisine type" value={state.cuisineType} onChange={(v) => setState((s) => ({ ...s, cuisineType: v }))} />
              <Field label="Location" value={state.location} onChange={(v) => setState((s) => ({ ...s, location: v }))} />
              <Field label="Website" value={state.website} onChange={(v) => setState((s) => ({ ...s, website: v }))} />
              <Field label="Instagram" value={state.instagram} onChange={(v) => setState((s) => ({ ...s, instagram: v }))} />
              <Field label="Tone / positioning" value={state.tone} onChange={(v) => setState((s) => ({ ...s, tone: v }))} />
              <div className="sm:col-span-2"><Field label="Target audience" value={state.audience} onChange={(v) => setState((s) => ({ ...s, audience: v }))} /></div>
              <div className="sm:col-span-2">
                <Label>Brand positioning</Label>
                <Textarea value={state.positioning} onChange={(e) => setState((s) => ({ ...s, positioning: e.target.value }))} />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="brand">
            <Card><CardContent className="pt-6 space-y-4">
              <div><Label>Voice style</Label><Textarea value={state.voiceStyle} onChange={(e) => setState((s) => ({ ...s, voiceStyle: e.target.value }))} /></div>
              <div><Label>Visual style</Label><Textarea value={state.visualStyle} onChange={(e) => setState((s) => ({ ...s, visualStyle: e.target.value }))} /></div>
              <div><Label>Content goals</Label><Textarea value={state.contentGoals} onChange={(e) => setState((s) => ({ ...s, contentGoals: e.target.value }))} /></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="assets">
            <Card><CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">Upload real starter photos so Autopilot can generate asset-backed posts from day one.</p>
              <div className="flex items-center gap-3">
                <Input type="file" accept="image/*,video/*" multiple onChange={(e) => uploadStarterAssets(e.target.files)} disabled={uploading} />
                <Badge variant="outline">{assetsCount} assets in pool</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Default metadata applied: reusable by Autopilot, evergreen, medium priority, visual type: dish. Edit metadata in Content as needed.</p>
              <div className="flex flex-wrap gap-2">{visualTypes.map((t) => <Badge variant="secondary" key={t}>{t}</Badge>)}</div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card><CardContent className="pt-6 space-y-2 text-sm text-muted-foreground">
              <p>Connect review sources first. Booking/POS/event feeds can be connected later.</p>
              <Button variant="outline" onClick={() => window.location.assign('/venue/integrations')}>Open integrations</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="autopilot">
            <Card><CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between"><Label>Require image asset for runs</Label><Switch checked={state.requireAssetForRuns} onCheckedChange={(v) => setState((s) => ({ ...s, requireAssetForRuns: v }))} /></div>
              <div className="flex items-center justify-between"><Label>Allow copy-only fallback</Label><Switch checked={state.allowCopyOnlyFallback} onCheckedChange={(v) => setState((s) => ({ ...s, allowCopyOnlyFallback: v }))} /></div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>Mode</Label><Select value={state.autopilotMode} onValueChange={(v: 'conservative' | 'creative') => setState((s) => ({ ...s, autopilotMode: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="conservative">Conservative</SelectItem><SelectItem value="creative">Creative</SelectItem></SelectContent></Select></div>
                <div><Label>Run frequency</Label><Select value={state.frequency} onValueChange={(v: 'daily' | '3x_week' | 'weekly') => setState((s) => ({ ...s, frequency: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="3x_week">3x weekly</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select></div>
              </div>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={saveSetup} disabled={saving}>{saving ? 'Saving...' : 'Save setup'}</Button>
        </div>
      </div>
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function parseRules(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
