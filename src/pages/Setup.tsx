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
import { X, Pencil, Save, ImageIcon, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { resolveAssetMediaUrl } from '@/hooks/use-resolved-media';

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

type WebsiteSuggestions = {
  venueName: string;
  cuisineType: string;
  location: string;
  tone: string;
  audience: string;
  positioning: string;
  voiceStyle: string;
  visualStyle: string;
  contentGoals: string;
};

type WebsiteAnalysisResult = {
  website_url: string;
  suggestions: WebsiteSuggestions;
  confidence: 'high' | 'medium' | 'low';
  warnings?: string[];
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

type SetupAsset = {
  id: string;
  title: string | null;
  asset_type: 'image' | 'video';
  public_url: string | null;
  thumbnail_url: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  resolved_url?: string;
};

export default function SetupPage() {
  const { currentVenue, refreshVenues } = useVenue();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<SetupState>(defaultState);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assets, setAssets] = useState<SetupAsset[]>([]);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState('');
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [analysisUrl, setAnalysisUrl] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<WebsiteAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [websiteAnalyzed, setWebsiteAnalyzed] = useState(false);
  const [coreProfileConfirmed, setCoreProfileConfirmed] = useState(false);

  const onboarding = searchParams.get('onboarding') === '1';

  const fetchAssets = async (venueId: string) => {
    setLoadingAssets(true);
    try {
      const { data, error } = await supabase
        .from('content_assets')
        .select('id, title, asset_type, public_url, thumbnail_url, storage_path, storage_bucket, metadata, created_at')
        .eq('venue_id', venueId)
        .eq('pool', 'asset_pool')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = (data || []) as SetupAsset[];
      const withResolved = await Promise.all(rows.map(async (asset) => ({
        ...asset,
        resolved_url: await resolveAssetMediaUrl({
          public_url: asset.public_url,
          thumbnail_url: asset.thumbnail_url,
          storage_path: asset.storage_path,
        }),
      })));
      setAssets(withResolved);
    } catch (error: any) {
      toast({ title: 'Failed to load assets', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    if (!currentVenue) return;
    (async () => {
      const [profileRes, kitRes, settingsRes] = await Promise.all([
        supabase.from('venue_style_profiles').select('*').eq('venue_id', currentVenue.id).maybeSingle(),
        supabase.from('brand_kits').select('rules_text').eq('venue_id', currentVenue.id).maybeSingle(),
        supabase.from('autopilot_settings').select('*').eq('venue_id', currentVenue.id).maybeSingle(),
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
      setAnalysisUrl(currentVenue.website_url || '');
      setWebsiteAnalyzed(Boolean(currentVenue.website_url && profileRes.data));
      setCoreProfileConfirmed(Boolean(currentVenue.name && profileRes.data?.cuisine_type && profileRes.data?.brand_summary));
      await fetchAssets(currentVenue.id);
    })();
  }, [currentVenue?.id]);

  const completion = useMemo(() => {
    let done = 0;
    if (websiteAnalyzed) done++;
    if (coreProfileConfirmed) done++;
    if (assets.length > 0) done++;
    if (state.frequency && state.approvalMode) done++;
    return Math.round((done / 4) * 100);
  }, [websiteAnalyzed, coreProfileConfirmed, assets.length, state.frequency, state.approvalMode]);

  const analyzeWebsite = async () => {
    if (!analysisUrl.trim()) {
      setAnalysisError('Enter a website URL to analyze.');
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-venue-website', {
        body: {
          website_url: analysisUrl,
          venue_id: currentVenue?.id,
        },
      });

      if (error) throw error;
      if (!data?.suggestions) throw new Error('No suggestions returned.');

      setWebsiteAnalyzed(true);
      setAnalysisResult(data as WebsiteAnalysisResult);

      if (Array.isArray(data?.warnings) && data.warnings.length > 0) {
        toast({
          title: 'Analysis completed with partial data',
          description: data.warnings[0],
        });
      } else {
        toast({ title: 'Website analyzed', description: 'Pulse generated a draft profile. Review and confirm it below.' });
      }
    } catch (error: any) {
      const message = error?.message || 'Website analysis failed. Please verify the URL and try again.';
      setAnalysisError(message);
      toast({ title: 'Analysis failed', description: message, variant: 'destructive' });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const applySuggestions = () => {
    if (!analysisResult?.suggestions) return;
    const draft = analysisResult.suggestions;

    setState((prev) => ({
      ...prev,
      website: analysisResult.website_url || prev.website,
      venueName: draft.venueName || prev.venueName,
      cuisineType: draft.cuisineType || prev.cuisineType,
      location: draft.location || prev.location,
      tone: draft.tone || prev.tone,
      audience: draft.audience || prev.audience,
      positioning: draft.positioning || prev.positioning,
      voiceStyle: draft.voiceStyle || prev.voiceStyle,
      visualStyle: draft.visualStyle || prev.visualStyle,
      contentGoals: draft.contentGoals || prev.contentGoals,
    }));

    setCoreProfileConfirmed(false);
    toast({ title: 'Draft applied', description: 'Suggestions were added as a draft. Edit anything before confirming.' });
  };

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
        const { error: uploadErr } = await supabase.storage.from('asset-pool').upload(path, file);
        if (uploadErr) throw uploadErr;

        const { data: signed } = await supabase.storage.from('asset-pool').createSignedUrl(path, 86400);
        await supabase.from('content_assets').insert({
          venue_id: currentVenue.id,
          asset_type: file.type.startsWith('video') ? 'video' : 'image',
          source_type: 'upload',
          status: 'approved',
          title: file.name,
          storage_path: path,
          storage_bucket: 'asset-pool',
          pool: 'asset_pool',
          public_url: signed?.signedUrl || null,
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
      await fetchAssets(currentVenue.id);
      toast({ title: 'Assets uploaded', description: `${files.length} starter asset(s) added to your Autopilot pool.` });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const deleteAsset = async (asset: SetupAsset) => {
    if (!currentVenue) return;
    setDeletingAssetId(asset.id);
    try {
      if (asset.storage_path) {
        await supabase.storage.from(asset.storage_bucket || 'asset-pool').remove([asset.storage_path]);
      }
      const { error } = await supabase.from('content_assets').delete().eq('id', asset.id);
      if (error) throw error;
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      toast({ title: 'Asset deleted' });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingAssetId(null);
    }
  };

  const beginEditTags = (asset: SetupAsset) => {
    const tags = Array.isArray(asset.metadata?.tags) ? asset.metadata?.tags : [];
    setEditingAssetId(asset.id);
    setEditingTags(tags.join(', '));
  };

  const saveTags = async (asset: SetupAsset) => {
    const nextTags = editingTags.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      const nextMetadata = { ...(asset.metadata || {}), tags: nextTags };
      const { error } = await supabase.from('content_assets').update({ metadata: nextMetadata }).eq('id', asset.id);
      if (error) throw error;
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, metadata: nextMetadata } : a)));
      setEditingAssetId(null);
      setEditingTags('');
      toast({ title: 'Tags updated' });
    } catch (error: any) {
      toast({ title: 'Tag update failed', description: error.message, variant: 'destructive' });
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

          <TabsContent value="basics" className="space-y-4">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Analyse my venue
                </CardTitle>
                <CardDescription>
                  Step 1: add your website. Step 2: let Pulse infer your profile. Step 3: review, edit, and confirm.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-[1fr_auto] gap-3">
                  <Input
                    value={analysisUrl}
                    onChange={(e) => setAnalysisUrl(e.target.value)}
                    placeholder="https://yourvenue.com"
                  />
                  <Button onClick={analyzeWebsite} disabled={analysisLoading}>
                    {analysisLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analysing...</> : 'Analyse website'}
                  </Button>
                </div>
                {analysisError ? <p className="text-sm text-destructive">{analysisError}</p> : null}
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant={websiteAnalyzed ? 'default' : 'outline'}>Website analysed</Badge>
                  <Badge variant={coreProfileConfirmed ? 'default' : 'outline'}>Core profile confirmed</Badge>
                </div>
              </CardContent>
            </Card>

            {analysisResult ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Review inferred profile</CardTitle>
                  <CardDescription>
                    Confidence: <span className="font-medium">{analysisResult.confidence}</span>. Suggestions are drafts and never auto-overwrite saved data.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <Suggestion label="Venue name" value={analysisResult.suggestions.venueName} />
                    <Suggestion label="Cuisine type" value={analysisResult.suggestions.cuisineType} />
                    <Suggestion label="Location" value={analysisResult.suggestions.location} />
                    <Suggestion label="Tone" value={analysisResult.suggestions.tone} />
                    <Suggestion label="Audience" value={analysisResult.suggestions.audience} />
                    <Suggestion label="Voice style" value={analysisResult.suggestions.voiceStyle} />
                  </div>
                  <Suggestion label="Positioning" value={analysisResult.suggestions.positioning} multiline />
                  <Suggestion label="Visual style" value={analysisResult.suggestions.visualStyle} multiline />
                  <Suggestion label="Content goals / selling points" value={analysisResult.suggestions.contentGoals} multiline />
                  {analysisResult.warnings?.length ? (
                    <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                      {analysisResult.warnings[0]}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button onClick={applySuggestions}>Use these as my draft</Button>
                    <Button variant="outline" onClick={() => setAnalysisResult(null)}>Dismiss</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="pt-6 grid sm:grid-cols-2 gap-4">
                <Field label="Venue name" value={state.venueName} onChange={(v) => setState((s) => ({ ...s, venueName: v }))} />
                <Field label="Cuisine type" value={state.cuisineType} onChange={(v) => setState((s) => ({ ...s, cuisineType: v }))} />
                <Field label="Location" value={state.location} onChange={(v) => setState((s) => ({ ...s, location: v }))} />
                <Field label="Website" value={state.website} onChange={(v) => setState((s) => ({ ...s, website: v }))} />
                <Field label="Instagram (optional)" value={state.instagram} onChange={(v) => setState((s) => ({ ...s, instagram: v }))} />
                <Field label="Tone / positioning" value={state.tone} onChange={(v) => setState((s) => ({ ...s, tone: v }))} />
                <div className="sm:col-span-2"><Field label="Target audience" value={state.audience} onChange={(v) => setState((s) => ({ ...s, audience: v }))} /></div>
                <div className="sm:col-span-2">
                  <Label>Brand positioning</Label>
                  <Textarea value={state.positioning} onChange={(e) => setState((s) => ({ ...s, positioning: e.target.value }))} />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium text-sm">Confirm core profile</p>
                    <p className="text-xs text-muted-foreground">Step 4: confirm this profile reflects your venue (you can still edit anytime).</p>
                  </div>
                  <Button
                    size="sm"
                    variant={coreProfileConfirmed ? 'secondary' : 'default'}
                    onClick={() => setCoreProfileConfirmed((v) => !v)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {coreProfileConfirmed ? 'Confirmed' : 'Confirm profile'}
                  </Button>
                </div>
              </CardContent>
            </Card>
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
                <Badge variant="outline">{assets.length} assets in pool</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Default metadata applied: reusable by Autopilot, evergreen, medium priority, visual type: dish. Edit metadata in Content as needed.</p>
              <div className="flex flex-wrap gap-2">{visualTypes.map((t) => <Badge variant="secondary" key={t}>{t}</Badge>)}</div>

              {loadingAssets ? (
                <div className="py-10 text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading assets...
                </div>
              ) : assets.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center space-y-1">
                  <p className="font-medium">No assets uploaded yet</p>
                  <p className="text-sm text-muted-foreground">Upload starter images to build your Asset Pool for Autopilot and Content Library.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((asset) => {
                    const tags = Array.isArray(asset.metadata?.tags) ? asset.metadata.tags : [];
                    const label = asset.metadata?.label || asset.metadata?.visual_type || null;
                    const inEdit = editingAssetId === asset.id;
                    return (
                      <div key={asset.id} className="rounded-md border overflow-hidden bg-card">
                        <div className="aspect-square bg-muted relative">
                          {asset.asset_type === 'image' && asset.resolved_url ? (
                            <img src={asset.resolved_url} alt={asset.title || 'Venue asset'} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                              <ImageIcon className="h-4 w-4 mr-1" /> {asset.asset_type}
                            </div>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="text-sm font-medium truncate">{asset.title || 'Untitled asset'}</p>
                          <div className="flex flex-wrap gap-1">
                            {tags.length > 0 ? tags.map((tag: string) => (
                              <Badge key={`${asset.id}-${tag}`} variant="secondary">{tag}</Badge>
                            )) : <Badge variant="outline">No tags</Badge>}
                            {label ? <Badge variant="outline">{label}</Badge> : null}
                          </div>
                          {inEdit ? (
                            <div className="space-y-2">
                              <Input
                                value={editingTags}
                                onChange={(e) => setEditingTags(e.target.value)}
                                placeholder="dish, drink, dessert"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveTags(asset)}><Save className="h-3.5 w-3.5 mr-1" />Save tags</Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingAssetId(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => beginEditTags(asset)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit tags</Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteAsset(asset)} disabled={deletingAssetId === asset.id}>
                                <X className="h-3.5 w-3.5 mr-1" />Delete
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

function Suggestion({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className={`rounded-md border bg-muted/40 text-sm px-3 py-2 ${multiline ? 'min-h-16' : ''}`}>{value || '—'}</p>
    </div>
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
