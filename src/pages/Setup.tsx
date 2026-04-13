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
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Pencil, ImageIcon, ChevronDown, Loader2 } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { resolveAssetMediaUrl } from '@/hooks/use-resolved-media';
import { WebsiteAnalysisEntry } from '@/components/setup/WebsiteAnalysisEntry';
import { ProfileConfirmationCard } from '@/components/setup/ProfileConfirmationCard';
import { ASSET_TAG_CATEGORIES, PREDEFINED_ASSET_TAGS, normalizeAssetTags, splitAssetTags } from '@/lib/asset-tags';

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
  suggestedContentAngles: string;
  autopilotMode: 'conservative' | 'creative';
  autopilotPreference: 'light' | 'balanced' | 'active';
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
  keySellingPoints: string;
  suggestedContentAngles: string;
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
  suggestedContentAngles: '',
  autopilotMode: 'conservative',
  autopilotPreference: 'balanced',
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
  const [editingKnownTags, setEditingKnownTags] = useState<string[]>([]);
  const [editingLegacyTags, setEditingLegacyTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [analysisUrl, setAnalysisUrl] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<WebsiteAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [websiteAnalyzed, setWebsiteAnalyzed] = useState(false);
  const [coreProfileConfirmed, setCoreProfileConfirmed] = useState(false);
  const [minimalSetupComplete, setMinimalSetupComplete] = useState(false);

  const onboarding = searchParams.get('onboarding') === '1';
  const requestedTab = searchParams.get('tab') === 'automation' ? 'automation' : 'basics';

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
          storage_bucket: asset.storage_bucket,
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
        voiceStyle: rules.voiceStyle || profileRes.data?.venue_tone || '',
        visualStyle: rules.visualStyle || profileRes.data?.style_summary || '',
        contentGoals: profileRes.data?.key_selling_points || '',
        suggestedContentAngles: rules.suggestedContentAngles || rules.contentGoals || '',
        autopilotMode: ((settingsRes.data?.mode as SetupState['autopilotMode']) || 'conservative'),
        autopilotPreference: mapAutopilotPreference((settingsRes.data?.mode as SetupState['autopilotMode']) || 'conservative', (settingsRes.data?.frequency as SetupState['frequency']) || '3x_week'),
        requireAssetForRuns: settingsRes.data?.require_asset_for_runs ?? true,
        allowCopyOnlyFallback: settingsRes.data?.allow_copy_only_fallback ?? false,
        approvalMode: (settingsRes.data?.approval_mode as SetupState['approvalMode']) || 'require_approval',
        frequency: (settingsRes.data?.frequency as SetupState['frequency']) || '3x_week',
      });
      setAnalysisUrl(currentVenue.website_url || '');
      setWebsiteAnalyzed(Boolean(currentVenue.website_url && profileRes.data));
      setCoreProfileConfirmed(Boolean(currentVenue.name && profileRes.data?.cuisine_type && profileRes.data?.brand_summary));
      setMinimalSetupComplete(Boolean(currentVenue.website_url && profileRes.data && settingsRes.data));
      await fetchAssets(currentVenue.id);
    })();
  }, [currentVenue?.id]);

  const completion = useMemo(() => {
    let done = 0;
    if (websiteAnalyzed) done++;
    if (coreProfileConfirmed) done++;
    if (minimalSetupComplete) done++;
    return Math.round((done / 3) * 100);
  }, [websiteAnalyzed, coreProfileConfirmed, minimalSetupComplete]);

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
      voiceStyle: draft.tone || prev.voiceStyle,
      visualStyle: prev.visualStyle,
      contentGoals: draft.keySellingPoints || prev.contentGoals,
      suggestedContentAngles: draft.suggestedContentAngles || prev.suggestedContentAngles,
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
        suggestedContentAngles: state.suggestedContentAngles,
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
      setMinimalSetupComplete(true);
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

        await supabase.from('content_assets').insert({
          venue_id: currentVenue.id,
          asset_type: file.type.startsWith('video') ? 'video' : 'image',
          source_type: 'upload',
          status: 'approved',
          title: file.name,
          storage_path: path,
          storage_bucket: 'asset-pool',
          pool: 'asset_pool',
          public_url: null,
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
      toast({ title: 'Assets uploaded', description: `${files.length} starter asset(s) added to your Pulse asset pool.` });
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
    const { known, legacy } = splitAssetTags(asset.metadata?.tags);
    setEditingAssetId(asset.id);
    setEditingKnownTags(known);
    setEditingLegacyTags(legacy);
  };

  const cancelEditTags = () => {
    setEditingAssetId(null);
    setEditingKnownTags([]);
    setEditingLegacyTags([]);
  };

  const toggleKnownTag = (tag: string) => {
    setEditingKnownTags((prev) => (
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    ));
  };

  const saveTags = async (asset: SetupAsset) => {
    const nextTags = [...editingKnownTags, ...editingLegacyTags];
    setSavingTags(true);
    try {
      const nextMetadata = { ...(asset.metadata || {}), tags: nextTags };
      const { error } = await supabase.from('content_assets').update({ metadata: nextMetadata }).eq('id', asset.id);
      if (error) throw error;
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, metadata: nextMetadata } : a)));
      cancelEditTags();
      toast({ title: 'Tags updated' });
    } catch (error: any) {
      toast({ title: 'Tag update failed', description: error.message, variant: 'destructive' });
    } finally {
      setSavingTags(false);
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
              {onboarding ? 'Welcome! Complete this once and Pulse can start producing useful content immediately.' : 'Keep setup updated so Pulse keeps preparing strong outcomes in the background.'}
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs defaultValue={requestedTab} className="space-y-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="basics">Venue</TabsTrigger>
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="assets">Brand Library</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-4">
            <WebsiteAnalysisEntry
              analysisUrl={analysisUrl}
              analysisLoading={analysisLoading}
              analysisError={analysisError}
              websiteAnalyzed={websiteAnalyzed}
              coreProfileConfirmed={coreProfileConfirmed}
              onUrlChange={setAnalysisUrl}
              onAnalyze={analyzeWebsite}
            />

            {analysisResult ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Draft profile ready</CardTitle>
                  <CardDescription>
                    Pulse created this from your website. Nothing is saved until you confirm.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <Suggestion label="Venue name" value={analysisResult.suggestions.venueName} />
                    <Suggestion label="Cuisine type" value={analysisResult.suggestions.cuisineType} />
                    <Suggestion label="Location" value={analysisResult.suggestions.location} />
                    <Suggestion label="Tone" value={analysisResult.suggestions.tone} />
                    <Suggestion label="Audience" value={analysisResult.suggestions.audience} />
                    <Suggestion label="Positioning" value={analysisResult.suggestions.positioning} />
                  </div>
                  <Suggestion label="Key selling points" value={analysisResult.suggestions.keySellingPoints} multiline />
                  <Suggestion label="Suggested content angles" value={analysisResult.suggestions.suggestedContentAngles} multiline />
                  {analysisResult.warnings?.length ? (
                    <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                      {analysisResult.warnings[0]}
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button onClick={applySuggestions}>Use this draft</Button>
                    <Button variant="outline" onClick={() => setAnalysisResult(null)}>Dismiss</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <ProfileConfirmationCard
              values={{
                cuisineType: state.cuisineType,
                audience: state.audience,
                tone: state.tone,
                positioning: state.positioning,
                keyStrengths: state.contentGoals,
              }}
              confirmed={coreProfileConfirmed}
              onChange={(field, value) => {
                if (field === 'keyStrengths') {
                  setState((s) => ({ ...s, contentGoals: value }));
                  return;
                }
                setState((s) => ({ ...s, [field]: value }));
              }}
              onConfirm={() => setCoreProfileConfirmed((v) => !v)}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Optional finishing touches</CardTitle>
                <CardDescription>
                  Add these now, or skip and come back later.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <Field label="Instagram handle (optional)" value={state.instagram} onChange={(v) => setState((s) => ({ ...s, instagram: v }))} />
                <div>
                  <Label>Autopilot preference (optional)</Label>
                  <Select
                    value={state.autopilotPreference}
                    onValueChange={(v: SetupState['autopilotPreference']) => {
                      const mapped = deriveAutopilotFromPreference(v);
                      setState((s) => ({
                        ...s,
                        autopilotPreference: v,
                        autopilotMode: mapped.mode,
                        frequency: mapped.frequency,
                        approvalMode: mapped.approvalMode,
                      }));
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Photo uploads (optional)</Label>
                  <Input type="file" accept="image/*,video/*" multiple onChange={(e) => uploadStarterAssets(e.target.files)} disabled={uploading} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">Advanced manual editing</CardTitle>
                <CardDescription>
                  Prefer full control? Expand this section to edit every field directly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <details>
                  <summary className="cursor-pointer text-sm font-medium inline-flex items-center gap-2">
                    <ChevronDown className="h-4 w-4" />
                    Open manual fields
                  </summary>
                  <div className="pt-4 grid sm:grid-cols-2 gap-4">
                    <Field label="Venue name" value={state.venueName} onChange={(v) => setState((s) => ({ ...s, venueName: v }))} />
                    <Field label="Cuisine type" value={state.cuisineType} onChange={(v) => setState((s) => ({ ...s, cuisineType: v }))} />
                    <Field label="Location" value={state.location} onChange={(v) => setState((s) => ({ ...s, location: v }))} />
                    <Field label="Website" value={state.website} onChange={(v) => setState((s) => ({ ...s, website: v }))} />
                    <Field label="Tone" value={state.tone} onChange={(v) => setState((s) => ({ ...s, tone: v }))} />
                    <div className="sm:col-span-2"><Field label="Target audience" value={state.audience} onChange={(v) => setState((s) => ({ ...s, audience: v }))} /></div>
                    <div className="sm:col-span-2">
                      <Label>Brand positioning</Label>
                      <Textarea value={state.positioning} onChange={(e) => setState((s) => ({ ...s, positioning: e.target.value }))} />
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="brand">
            <Card><CardContent className="pt-6 space-y-4">
              <div><Label>Voice style</Label><Textarea value={state.voiceStyle} onChange={(e) => setState((s) => ({ ...s, voiceStyle: e.target.value }))} /></div>
              <div><Label>Visual style</Label><Textarea value={state.visualStyle} onChange={(e) => setState((s) => ({ ...s, visualStyle: e.target.value }))} /></div>
              <div><Label>Key selling points</Label><Textarea value={state.contentGoals} onChange={(e) => setState((s) => ({ ...s, contentGoals: e.target.value }))} /></div>
              <div><Label>Suggested content angles</Label><Textarea value={state.suggestedContentAngles} onChange={(e) => setState((s) => ({ ...s, suggestedContentAngles: e.target.value }))} /></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="assets">
            <Card><CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground">Upload real starter photos so Pulse can prepare asset-backed posts from day one.</p>
              <div className="flex items-center gap-3">
                <Input type="file" accept="image/*,video/*" multiple onChange={(e) => uploadStarterAssets(e.target.files)} disabled={uploading} />
                <Badge variant="outline">{assets.length} assets in pool</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Default metadata applied: reusable by Pulse, evergreen, medium priority, visual type: dish. Edit metadata in Content as needed.</p>
              <div className="flex flex-wrap gap-2">{PREDEFINED_ASSET_TAGS.map((t) => <Badge variant="secondary" key={t}>{t}</Badge>)}</div>

              {loadingAssets ? (
                <div className="py-10 text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading assets...
                </div>
              ) : assets.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center space-y-1">
                  <p className="font-medium">No assets uploaded yet</p>
                  <p className="text-sm text-muted-foreground">Upload starter images to build your Brand Library for Pulse and Content.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((asset) => {
                    const tags = normalizeAssetTags(asset.metadata?.tags);
                    const label = asset.metadata?.label || asset.metadata?.visual_type || null;
                    const legacyTags = splitAssetTags(tags).legacy;
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
                            {tags.length > 0 ? tags.map((tag: string) => {
                              const isLegacy = legacyTags.includes(tag);
                              return (
                                <Badge
                                  key={`${asset.id}-${tag}`}
                                  variant={isLegacy ? 'outline' : 'secondary'}
                                  className={isLegacy ? 'text-muted-foreground border-dashed' : undefined}
                                >
                                  {tag}{isLegacy ? ' (legacy)' : ''}
                                </Badge>
                              );
                            }) : <Badge variant="outline">No tags</Badge>}
                            {label ? <Badge variant="outline">{label}</Badge> : null}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => beginEditTags(asset)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit tags</Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteAsset(asset)} disabled={deletingAssetId === asset.id}>
                              <X className="h-3.5 w-3.5 mr-1" />Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent></Card>
            <Dialog open={Boolean(editingAssetId)} onOpenChange={(open) => !open && cancelEditTags()}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit asset tags</DialogTitle>
                  <DialogDescription>
                    Choose from predefined tags for consistent Brand Library metadata.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {ASSET_TAG_CATEGORIES.map((category) => (
                    <div key={category.key} className="space-y-2">
                      <p className="text-sm font-medium">{category.label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {category.tags.map((tag) => (
                          <label key={tag} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={editingKnownTags.includes(tag)}
                              onCheckedChange={() => toggleKnownTag(tag)}
                            />
                            <span>{tag}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {editingLegacyTags.length > 0 ? (
                    <div className="space-y-2 rounded-md border border-dashed p-3">
                      <p className="text-xs text-muted-foreground">
                        Legacy tags detected. You can remove them, but new legacy tags cannot be added.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {editingLegacyTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground"
                            onClick={() => setEditingLegacyTags((prev) => prev.filter((item) => item !== tag))}
                          >
                            {tag}
                            <X className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={cancelEditTags}>Cancel</Button>
                  <Button
                    onClick={() => {
                      const selected = assets.find((asset) => asset.id === editingAssetId);
                      if (selected) {
                        void saveTags(selected);
                      }
                    }}
                    disabled={savingTags || !editingAssetId}
                  >
                    {savingTags ? 'Saving...' : 'Save tags'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="integrations">
            <Card><CardContent className="pt-6 space-y-2 text-sm text-muted-foreground">
              <p>Connect review sources first. Booking/POS/event feeds can be connected later.</p>
              <Button variant="outline" onClick={() => window.location.assign('/venue/integrations')}>Open integrations</Button>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="automation">
            <Card><CardContent className="pt-6 space-y-4">
              <div>
                <p className="font-medium text-sm">Pulse Engine Settings</p>
                <p className="text-xs text-muted-foreground">Set cadence, approval behavior, and fallback rules for how Pulse prepares content and replies.</p>
              </div>
              <div className="flex items-center justify-between"><Label>Require image asset for runs</Label><Switch checked={state.requireAssetForRuns} onCheckedChange={(v) => setState((s) => ({ ...s, requireAssetForRuns: v }))} /></div>
              <div className="flex items-center justify-between"><Label>Allow copy-only fallback</Label><Switch checked={state.allowCopyOnlyFallback} onCheckedChange={(v) => setState((s) => ({ ...s, allowCopyOnlyFallback: v }))} /></div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>Mode</Label><Select value={state.autopilotMode} onValueChange={(v: 'conservative' | 'creative') => setState((s) => ({ ...s, autopilotMode: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="conservative">Conservative</SelectItem><SelectItem value="creative">Creative</SelectItem></SelectContent></Select></div>
                <div><Label>Run frequency</Label><Select value={state.frequency} onValueChange={(v: 'daily' | '3x_week' | 'weekly') => setState((s) => ({ ...s, frequency: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="3x_week">3x weekly</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select></div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Diagnostics and run history</p>
                  <p className="text-xs text-muted-foreground">Use this when you need deeper troubleshooting details.</p>
                </div>
                <Button variant="outline" onClick={() => window.location.assign('/autopilot')}>
                  View run history
                </Button>
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

function deriveAutopilotFromPreference(preference: SetupState['autopilotPreference']) {
  if (preference === 'light') {
    return {
      mode: 'conservative' as const,
      frequency: 'weekly' as const,
      approvalMode: 'require_approval' as const,
    };
  }

  if (preference === 'active') {
    return {
      mode: 'creative' as const,
      frequency: 'daily' as const,
      approvalMode: 'auto_schedule' as const,
    };
  }

  return {
    mode: 'conservative' as const,
    frequency: '3x_week' as const,
    approvalMode: 'require_approval' as const,
  };
}

function mapAutopilotPreference(
  mode: SetupState['autopilotMode'],
  frequency: SetupState['frequency'],
): SetupState['autopilotPreference'] {
  if (mode === 'creative' && frequency === 'daily') return 'active';
  if (frequency === 'weekly') return 'light';
  return 'balanced';
}
