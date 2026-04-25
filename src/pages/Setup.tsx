import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackButton } from '@/components/navigation/BackButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { resolveAssetMediaUrl } from '@/hooks/use-resolved-media';
import { supabase } from '@/integrations/supabase/client';
import { ASSET_TAG_CATEGORIES, normalizeAssetTags, splitAssetTags } from '@/lib/asset-tags';
import { cn } from '@/lib/utils';
import { useVenue } from '@/lib/venue-context';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  ImageIcon,
  Loader2,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react';

type SetupState = {
  venueName: string;
  cuisineType: string;
  location: string;
  website: string;
  instagram: string;
  tone: string;
  vibe: string;
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

type SetupAsset = {
  id: string;
  title: string | null;
  asset_type: 'image' | 'video';
  public_url: string | null;
  thumbnail_url: string | null;
  storage_path: string | null;
  storage_bucket: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  resolved_url?: string;
};

type SetupStep = 'profile' | 'brand' | 'photos' | 'automation';

const PROFILE_REQUIRED_FIELDS: Array<{ key: keyof SetupState; label: string }> = [
  { key: 'venueName', label: 'Venue name' },
  { key: 'website', label: 'Website' },
  { key: 'cuisineType', label: 'Cuisine type' },
  { key: 'tone', label: 'Tone' },
  { key: 'audience', label: 'Audience' },
  { key: 'positioning', label: 'Brand positioning' },
];

const defaultState: SetupState = {
  venueName: '',
  cuisineType: '',
  location: '',
  website: '',
  instagram: '',
  tone: '',
  vibe: '',
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

const STEP_ORDER: SetupStep[] = ['profile', 'brand', 'photos', 'automation'];

const STEP_COPY: Record<SetupStep, { title: string; description: string }> = {
  profile: {
    title: 'Profile',
    description: 'Tell Pulse who you are. Start with your website, then confirm the core profile.',
  },
  brand: {
    title: 'Brand',
    description: 'Shape how Pulse writes and what it emphasizes when generating content.',
  },
  photos: {
    title: 'Photos',
    description: 'Give Pulse reusable real photos so it can prepare stronger posts from day one.',
  },
  automation: {
    title: 'Automation',
    description: 'Choose how active Pulse should be, then open advanced controls only if you need them.',
  },
};

const PROFILE_FIELDS: Array<keyof SetupState> = [
  'venueName',
  'cuisineType',
  'location',
  'website',
  'instagram',
  'tone',
  'vibe',
  'audience',
  'positioning',
];

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
  const [profileReviewed, setProfileReviewed] = useState(false);
  const [automationConfigured, setAutomationConfigured] = useState(false);
  const [photosSkipped, setPhotosSkipped] = useState(false);
  const [activeStep, setActiveStep] = useState<SetupStep>(mapQueryTabToStep(searchParams.get('tab')));

  const onboarding = searchParams.get('onboarding') === '1';

  const fetchAssets = useCallback(async (venueId: string) => {
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
      if (withResolved.length > 0) {
        setPhotosSkipped(false);
      }
    } catch (error: unknown) {
      toast({ title: 'Failed to load assets', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoadingAssets(false);
    }
  }, [toast]);

  useEffect(() => {
    setActiveStep(mapQueryTabToStep(searchParams.get('tab')));
  }, [searchParams]);

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

      const nextState: SetupState = {
        venueName: currentVenue.name || '',
        cuisineType: profileRes.data?.cuisine_type || '',
        location: city,
        website: currentVenue.website_url || '',
        instagram: currentVenue.instagram_handle || '',
        tone: profileRes.data?.venue_tone || '',
        vibe: profileRes.data?.lighting_mood || '',
        audience: profileRes.data?.target_audience || '',
        positioning: profileRes.data?.brand_summary || '',
        voiceStyle: rules.voiceStyle || profileRes.data?.venue_tone || '',
        visualStyle: rules.visualStyle || profileRes.data?.style_summary || '',
        contentGoals: profileRes.data?.key_selling_points || '',
        suggestedContentAngles: rules.suggestedContentAngles || rules.contentGoals || '',
        autopilotMode: ((settingsRes.data?.mode as SetupState['autopilotMode']) || 'conservative'),
        autopilotPreference: mapAutopilotPreference(
          ((settingsRes.data?.mode as SetupState['autopilotMode']) || 'conservative'),
          ((settingsRes.data?.frequency as SetupState['frequency']) || '3x_week'),
          ((settingsRes.data?.approval_mode as SetupState['approvalMode']) || 'require_approval'),
        ),
        requireAssetForRuns: settingsRes.data?.require_asset_for_runs ?? true,
        allowCopyOnlyFallback: settingsRes.data?.allow_copy_only_fallback ?? false,
        approvalMode: (settingsRes.data?.approval_mode as SetupState['approvalMode']) || 'require_approval',
        frequency: (settingsRes.data?.frequency as SetupState['frequency']) || '3x_week',
      };
      setState(nextState);
      setAnalysisUrl(currentVenue.website_url || '');
      setWebsiteAnalyzed(Boolean(currentVenue.website_url && profileRes.data));
      setProfileReviewed(false);
      setAutomationConfigured(Boolean(settingsRes.data));
      await fetchAssets(currentVenue.id);
    })();
  }, [currentVenue, fetchAssets]);

  const updateField = <K extends keyof SetupState>(field: K, value: SetupState[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const updateAutomationState = (updates: Partial<Pick<SetupState, 'autopilotMode' | 'frequency' | 'approvalMode' | 'requireAssetForRuns' | 'allowCopyOnlyFallback'>>) => {
    setState((prev) => {
      const next = { ...prev, ...updates };
      const matchedPreference = matchAutopilotPreference(next.autopilotMode, next.frequency, next.approvalMode);
      return {
        ...next,
        autopilotPreference: matchedPreference ?? prev.autopilotPreference,
      };
    });
  };

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
        toast({ title: 'Website analyzed', description: 'Pulse generated a draft profile. Review it inline below.' });
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Website analysis failed. Please verify the URL and try again.');
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
      contentGoals: draft.keySellingPoints || prev.contentGoals,
      suggestedContentAngles: draft.suggestedContentAngles || prev.suggestedContentAngles,
    }));

    setProfileReviewed(false);
    toast({ title: 'Draft applied', description: 'Review the populated fields and tweak anything that needs to change.' });
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
          lighting_mood: state.vibe || null,
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
      setAutomationConfigured(true);
      toast({ title: 'Setup saved', description: 'Pulse now has a clearer profile, reusable assets, and automation settings to work from.' });
    } catch (error: unknown) {
      toast({ title: 'Failed to save setup', description: getErrorMessage(error), variant: 'destructive' });
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
      setPhotosSkipped(false);
      toast({ title: 'Assets uploaded', description: `${files.length} reusable asset(s) added to your library.` });
    } catch (error: unknown) {
      toast({ title: 'Upload failed', description: getErrorMessage(error), variant: 'destructive' });
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
    } catch (error: unknown) {
      toast({ title: 'Delete failed', description: getErrorMessage(error), variant: 'destructive' });
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
    } catch (error: unknown) {
      toast({ title: 'Tag update failed', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setSavingTags(false);
    }
  };

  const missingProfileFields = useMemo(
    () => getMissingProfileFields(state),
    [state],
  );
  const profileHasRequiredFields = missingProfileFields.length === 0;
  const profileComplete = profileHasRequiredFields;
  const brandComplete = useMemo(
    () => hasBrandGuidance(state),
    [state],
  );
  const photosComplete = assets.length > 0 || photosSkipped;
  const automationComplete = automationConfigured;

  const stepStatus: Record<SetupStep, boolean> = {
    profile: profileComplete,
    brand: brandComplete,
    photos: photosComplete,
    automation: automationComplete,
  };

  const completion = Math.round((Object.values(stepStatus).filter(Boolean).length / STEP_ORDER.length) * 100);
  const nextStep = STEP_ORDER.find((step) => !stepStatus[step]) ?? STEP_ORDER[STEP_ORDER.length - 1];
  const presetOverride = hasAdvancedAutomationOverride(state);

  return (
    <>
      <BackButton fallbackTo="/home" />
      <PageHeader title="Setup" description="Set Pulse up once, then let it run with confidence." />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-32 pt-2 sm:px-6">
        <Card className="border-accent/30 bg-gradient-to-br from-background via-background to-accent/5">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl">A simpler, guided setup</CardTitle>
                <CardDescription>
                  {onboarding
                    ? 'Complete these four steps once so Pulse can start producing useful work immediately.'
                    : 'Everything important now lives in one calm flow. Review any step, save, and keep moving.'}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="w-fit">{completion}% complete</Badge>
            </div>
            <div className="space-y-3">
              <Progress value={completion} className="h-2" />
              <div className="grid gap-3 sm:grid-cols-4">
                {STEP_ORDER.map((step, index) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setActiveStep(step)}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-colors',
                      activeStep === step ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Step {index + 1}
                      </span>
                      {stepStatus[step] ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <p className="font-medium">{STEP_COPY[step].title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {stepStatus[step]
                        ? 'Complete'
                        : getStepSummary(step, false, assets.length, photosSkipped, missingProfileFields)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">What Pulse still needs</CardTitle>
              <CardDescription>
                Save at any time. Pulse uses what is already complete right away.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {STEP_ORDER.map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setActiveStep(step)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                    activeStep === step ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30',
                  )}
                >
                  {stepStatus[step] ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{STEP_COPY[step].title}</p>
                    <p className="text-sm text-muted-foreground">
                      {getStepSummary(
                        step,
                        stepStatus[step],
                        assets.length,
                        photosSkipped,
                        missingProfileFields,
                        profileHasRequiredFields && !coreProfileConfirmed,
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {activeStep === 'profile' ? (
              <ProfileStepSection
                state={state}
                websiteAnalyzed={websiteAnalyzed}
                analysisUrl={analysisUrl}
                analysisLoading={analysisLoading}
                analysisError={analysisError}
                analysisResult={analysisResult}
                coreProfileConfirmed={coreProfileConfirmed}
                profileHasRequiredFields={profileHasRequiredFields}
                missingProfileFields={missingProfileFields}
                profileNeedsReconfirm={profileNeedsReconfirm}
                onUrlChange={setAnalysisUrl}
                onAnalyze={analyzeWebsite}
                onApplySuggestions={applySuggestions}
                onDismissSuggestions={() => setAnalysisResult(null)}
                onFieldChange={updateField}
                onConfirm={() => {
                  setCoreProfileConfirmed((value) => !value);
                  setProfileNeedsReconfirm(false);
                }}
              />
            ) : null}

            {activeStep === 'brand' ? (
              <BrandStepSection state={state} onFieldChange={updateField} />
            ) : null}

            {activeStep === 'photos' ? (
              <PhotosStepSection
                assets={assets}
                loadingAssets={loadingAssets}
                uploading={uploading}
                photosSkipped={photosSkipped}
                deletingAssetId={deletingAssetId}
                onSkip={() => setPhotosSkipped(true)}
                onUpload={uploadStarterAssets}
                onDelete={deleteAsset}
                onEditTags={beginEditTags}
              />
            ) : null}

            {activeStep === 'automation' ? (
              <AutomationStepSection
                state={state}
                presetOverride={presetOverride}
                onPreferenceChange={(preference) => {
                  const mapped = deriveAutopilotFromPreference(preference);
                  setState((prev) => ({
                    ...prev,
                    autopilotPreference: preference,
                    autopilotMode: mapped.mode,
                    frequency: mapped.frequency,
                    approvalMode: mapped.approvalMode,
                  }));
                }}
                onFieldChange={updateAutomationState}
              />
            ) : null}
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Need publishing?</p>
              <p className="text-sm text-muted-foreground">
                Integrations still live separately. Connect Buffer there when you are ready to publish approved content directly from Pulse.
              </p>
            </div>
            <Button variant="outline" onClick={() => window.location.assign('/venue/integrations')}>
              Manage integrations
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

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

        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {completion === 100 ? 'Everything important is in place.' : `Next up: ${STEP_COPY[nextStep].title}`}
              </p>
              <p className="text-sm text-muted-foreground">
                {completion === 100
                  ? 'Save to keep your latest changes live for Pulse.'
                  : getStickyCopy(
                    nextStep,
                    photosSkipped,
                    assets.length,
                    missingProfileFields,
                    profileHasRequiredFields && !coreProfileConfirmed,
                  )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline">{completion}% complete</Badge>
              <Button onClick={saveSetup} disabled={saving}>
                {saving ? 'Saving...' : 'Save setup'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ProfileStepSection({
  state,
  websiteAnalyzed,
  analysisUrl,
  analysisLoading,
  analysisError,
  analysisResult,
  coreProfileConfirmed,
  profileHasRequiredFields,
  missingProfileFields,
  profileNeedsReconfirm,
  onUrlChange,
  onAnalyze,
  onApplySuggestions,
  onDismissSuggestions,
  onFieldChange,
  onConfirm,
}: {
  state: SetupState;
  websiteAnalyzed: boolean;
  analysisUrl: string;
  analysisLoading: boolean;
  analysisError: string | null;
  analysisResult: WebsiteAnalysisResult | null;
  coreProfileConfirmed: boolean;
  profileHasRequiredFields: boolean;
  missingProfileFields: string[];
  profileNeedsReconfirm: boolean;
  onUrlChange: (value: string) => void;
  onAnalyze: () => void;
  onApplySuggestions: () => void;
  onDismissSuggestions: () => void;
  onFieldChange: <K extends keyof SetupState>(field: K, value: SetupState[K]) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Start with your website
          </CardTitle>
          <CardDescription>
            Pulse can draft your profile from the website first, so you are editing a starting point instead of a blank form.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              value={analysisUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://yourvenue.com"
            />
            <Button onClick={onAnalyze} disabled={analysisLoading}>
              {analysisLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analysing...
                </>
              ) : (
                'Generate draft'
              )}
            </Button>
          </div>
          {analysisError ? <p className="text-sm text-destructive">{analysisError}</p> : null}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant={websiteAnalyzed ? 'default' : 'outline'}>
              {websiteAnalyzed ? 'Website analysed' : 'Website not analysed'}
            </Badge>
            <Badge variant={coreProfileConfirmed ? 'default' : 'outline'}>
              {coreProfileConfirmed ? 'Profile confirmed' : 'Confirmation needed'}
            </Badge>
            <Badge variant={profileHasRequiredFields ? 'default' : 'outline'}>
              {profileHasRequiredFields ? 'Core fields ready' : 'Missing core fields'}
            </Badge>
          </div>
          {!coreProfileConfirmed || !profileHasRequiredFields ? (
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-medium">Still needed</p>
              {missingProfileFields.length > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Add {formatInlineList(missingProfileFields)} to mark Profile complete.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Everything is filled in. Confirm once to mark Profile complete.
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {analysisResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Draft ready</CardTitle>
            <CardDescription>
              Pulse found a starting profile. Apply it to the fields below, then confirm when it feels right.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
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
            <div className="flex flex-wrap gap-2">
              <Button onClick={onApplySuggestions}>Use this draft</Button>
              <Button variant="outline" onClick={onDismissSuggestions}>Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review the core profile</CardTitle>
          <CardDescription>
            Each field only appears once here. Edit inline until this feels true to the venue, then confirm it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Venue name" value={state.venueName} onChange={(value) => onFieldChange('venueName', value)} />
            <Field label="Website" value={state.website} onChange={(value) => onFieldChange('website', value)} />
            <Field label="Cuisine type" value={state.cuisineType} onChange={(value) => onFieldChange('cuisineType', value)} />
            <Field label="Location" value={state.location} onChange={(value) => onFieldChange('location', value)} />
            <Field label="Instagram handle" value={state.instagram} onChange={(value) => onFieldChange('instagram', value)} />
            <VenueStyleSelect
              label="Tone"
              value={state.tone}
              onValueChange={(value) => onFieldChange('tone', value)}
              options={[
                { value: 'premium', label: 'Premium' },
                { value: 'casual', label: 'Casual' },
                { value: 'energetic', label: 'Energetic' },
              ]}
            />
            <VenueStyleSelect
              label="Vibe"
              value={state.vibe}
              onValueChange={(value) => onFieldChange('vibe', value)}
              options={[
                { value: 'dark_intimate', label: 'Dark & intimate' },
                { value: 'bright_clean', label: 'Bright & clean' },
                { value: 'lively_busy', label: 'Lively & busy' },
              ]}
            />
            <VenueStyleSelect
              label="Audience"
              value={state.audience}
              onValueChange={(value) => onFieldChange('audience', value)}
              options={[
                { value: 'couples', label: 'Couples' },
                { value: 'groups', label: 'Groups' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />
            <div className="sm:col-span-2">
              <Label>Brand positioning</Label>
              <Textarea value={state.positioning} onChange={(e) => onFieldChange('positioning', e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Confirm what Pulse should use</p>
              <p className="text-sm text-muted-foreground">
                {profileNeedsReconfirm
                  ? 'You changed the profile. Confirm once more to lock this in.'
                  : 'Confirmation makes the setup feel deliberate. Any later edits will ask for confirmation again.'}
              </p>
            </div>
            <Button
              size="sm"
              variant={coreProfileConfirmed ? 'secondary' : 'default'}
              onClick={onConfirm}
              disabled={!profileHasRequiredFields}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {coreProfileConfirmed ? 'Confirmed' : 'Confirm profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BrandStepSection({
  state,
  onFieldChange,
}: {
  state: SetupState;
  onFieldChange: <K extends keyof SetupState>(field: K, value: SetupState[K]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Brand guidance</CardTitle>
        <CardDescription>
          These fields shape the voice and emphasis of generated captions, briefs, and ideas. Keep them short, direct, and reusable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Voice style</Label>
          <Textarea value={state.voiceStyle} onChange={(e) => onFieldChange('voiceStyle', e.target.value)} />
        </div>
        <div>
          <Label>Visual style</Label>
          <Textarea value={state.visualStyle} onChange={(e) => onFieldChange('visualStyle', e.target.value)} />
        </div>
        <div>
          <Label>Key selling points</Label>
          <Textarea value={state.contentGoals} onChange={(e) => onFieldChange('contentGoals', e.target.value)} />
        </div>
        <div>
          <Label>Suggested content angles</Label>
          <Textarea value={state.suggestedContentAngles} onChange={(e) => onFieldChange('suggestedContentAngles', e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function PhotosStepSection({
  assets,
  loadingAssets,
  uploading,
  photosSkipped,
  deletingAssetId,
  onSkip,
  onUpload,
  onDelete,
  onEditTags,
}: {
  assets: SetupAsset[];
  loadingAssets: boolean;
  uploading: boolean;
  photosSkipped: boolean;
  deletingAssetId: string | null;
  onSkip: () => void;
  onUpload: (files: FileList | null) => void;
  onDelete: (asset: SetupAsset) => void;
  onEditTags: (asset: SetupAsset) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const featuredAssets = assets.slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reusable photos</CardTitle>
        <CardDescription>
          Add real venue photos Pulse can safely reuse. If you do not have them yet, skip this step and come back later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-2xl border bg-muted/20 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Add reusable venue photos</p>
              <p className="text-sm text-muted-foreground">
                Upload real venue photos or short videos Pulse can safely reuse in future automation runs.
              </p>
            </div>
            <Badge variant="outline">{assets.length} asset{assets.length === 1 ? '' : 's'}</Badge>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
            disabled={uploading}
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-dashed bg-background/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Upload new assets</p>
                  <p className="text-sm text-muted-foreground">
                    {assets.length > 0
                      ? `${assets.length} reusable asset${assets.length === 1 ? '' : 's'} ready for Pulse already.`
                      : 'A few strong venue images are enough to make automation much more dependable.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Choose files'
                    )}
                  </Button>
                  {assets.length === 0 ? (
                    <Button type="button" variant="ghost" onClick={onSkip}>
                      {photosSkipped ? 'Skipped for now' : 'Skip for now'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {featuredAssets.length > 0 ? (
              <div className="rounded-2xl border bg-background/60 p-4">
                <p className="text-sm font-medium">Ready for reuse</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pulse will use these as a reusable starter library for future automation runs.
                </p>
                <div className="mt-3 flex -space-x-3 overflow-hidden">
                  {featuredAssets.map((asset) => (
                    <div key={asset.id} className="h-16 w-16 overflow-hidden rounded-2xl border bg-muted shadow-sm">
                      {asset.asset_type === 'image' && asset.resolved_url ? (
                        <img src={asset.resolved_url} alt={asset.title || 'Venue asset'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {loadingAssets ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading assets...
          </div>
        ) : assets.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <p className="font-medium">{photosSkipped ? 'Photos skipped for now' : 'No reusable photos uploaded yet'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {photosSkipped
                ? 'Pulse can still work from your profile and brand guidance, and you can add assets later.'
                : 'Add a few real venue images to give Pulse a reusable starter library.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Library</p>
                <p className="text-sm text-muted-foreground">Manage the reusable photos Pulse can draw from.</p>
              </div>
              <Badge variant="secondary">{assets.length} reusable asset{assets.length === 1 ? '' : 's'} ready</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => {
                const tags = normalizeAssetTags(asset.metadata?.tags);
                const label = asset.metadata?.label || asset.metadata?.visual_type || null;
                const legacyTags = splitAssetTags(tags).legacy;
                const visibleTags = tags.slice(0, 2);
                const extraTagCount = Math.max(tags.length - visibleTags.length, 0);
                return (
                  <div key={asset.id} className="overflow-hidden rounded-2xl border bg-card">
                    <div className="relative aspect-[4/3] bg-muted">
                      {asset.asset_type === 'image' && asset.resolved_url ? (
                        <img src={asset.resolved_url} alt={asset.title || 'Venue asset'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                          <ImageIcon className="mr-1 h-4 w-4" />
                          {asset.asset_type}
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="space-y-1">
                        <p className="truncate text-sm font-medium">{asset.title || 'Untitled asset'}</p>
                        <p className="text-xs text-muted-foreground">
                          {asset.asset_type === 'video' ? 'Video asset' : 'Image asset'}
                          {label ? ` • ${label}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tags.length > 0 ? visibleTags.map((tag) => {
                          const isLegacy = legacyTags.includes(tag);
                          return (
                            <Badge
                              key={`${asset.id}-${tag}`}
                              variant={isLegacy ? 'outline' : 'secondary'}
                              className={isLegacy ? 'border-dashed text-muted-foreground' : undefined}
                            >
                              {tag}
                              {isLegacy ? ' (legacy)' : ''}
                            </Badge>
                          );
                        }) : <Badge variant="outline">No tags yet</Badge>}
                        {extraTagCount > 0 ? <Badge variant="outline">+{extraTagCount} more</Badge> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => onEditTags(asset)} className="flex-1">
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit tags
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onDelete(asset)}
                          disabled={deletingAssetId === asset.id}
                          aria-label={`Delete ${asset.title || 'asset'}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AutomationStepSection({
  state,
  presetOverride,
  onPreferenceChange,
  onFieldChange,
}: {
  state: SetupState;
  presetOverride: boolean;
  onPreferenceChange: (preference: SetupState['autopilotPreference']) => void;
  onFieldChange: (updates: Partial<Pick<SetupState, 'autopilotMode' | 'frequency' | 'approvalMode' | 'requireAssetForRuns' | 'allowCopyOnlyFallback'>>) => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How active should Pulse be?</CardTitle>
          <CardDescription>
            Pick the level that feels right. Most teams never need to touch the advanced controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              {
                value: 'light',
                title: 'Light',
                description: 'Weekly, cautious, always reviewed before anything is scheduled.',
              },
              {
                value: 'balanced',
                title: 'Balanced',
                description: 'A practical default with steady output and approval-first behavior.',
              },
              {
                value: 'active',
                title: 'Active',
                description: 'Daily, more creative, and ready to auto-schedule when appropriate.',
              },
            ] as const).map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onPreferenceChange(preset.value)}
                className={cn(
                  'rounded-2xl border p-4 text-left transition-colors',
                  state.autopilotPreference === preset.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30',
                )}
              >
                <p className="font-medium">{preset.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border bg-muted/20 p-4">
            <p className="text-sm font-medium">Current behavior</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {describeAutopilotBehavior(state)}
            </p>
            {presetOverride ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Advanced controls currently override the standard preset.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Collapsible>
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Advanced controls</CardTitle>
                <CardDescription>
                  Fine-tune cadence, approval behavior, and fallback rules only if the preset is not enough.
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="outline">
                  Show controls
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Mode</Label>
                  <Select value={state.autopilotMode} onValueChange={(value: SetupState['autopilotMode']) => onFieldChange({ autopilotMode: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="creative">Creative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Run frequency</Label>
                  <Select value={state.frequency} onValueChange={(value: SetupState['frequency']) => onFieldChange({ frequency: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="3x_week">3x weekly</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Approval mode</Label>
                  <Select value={state.approvalMode} onValueChange={(value: SetupState['approvalMode']) => onFieldChange({ approvalMode: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="require_approval">Require approval</SelectItem>
                      <SelectItem value="auto_schedule">Auto-schedule</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Require image asset for runs</Label>
                    <p className="text-sm text-muted-foreground">Keeps automation asset-first when enabled.</p>
                  </div>
                  <Switch checked={state.requireAssetForRuns} onCheckedChange={(value) => onFieldChange({ requireAssetForRuns: value })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Allow copy-only fallback</Label>
                    <p className="text-sm text-muted-foreground">Lets Pulse prepare copy-only drafts when assets are not strong enough.</p>
                  </div>
                  <Switch checked={state.allowCopyOnlyFallback} onCheckedChange={(value) => onFieldChange({ allowCopyOnlyFallback: value })} />
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">Need the full automation view?</p>
            <p className="text-sm text-muted-foreground">
              Open Pulse automation status, diagnostics, and run history in the dedicated automation area.
            </p>
          </div>
          <Button variant="outline" onClick={() => window.location.assign('/autopilot')}>
            View automation
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Suggestion({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className={cn('rounded-md border bg-muted/40 px-3 py-2 text-sm', multiline ? 'min-h-16' : '')}>{value || '—'}</p>
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

function VenueStyleSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value || '__infer__'} onValueChange={(next) => onValueChange(next === '__infer__' ? '' : next)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__infer__">Infer from Brand Library</SelectItem>
          {options.map((option) => (
            <SelectItem key={`${label}-${option.value}`} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function mapQueryTabToStep(tab: string | null): SetupStep {
  if (tab === 'brand') return 'brand';
  if (tab === 'assets') return 'photos';
  if (tab === 'automation' || tab === 'integrations') return 'automation';
  return 'profile';
}

function hasRequiredProfileFields(state: SetupState) {
  return getMissingProfileFields(state).length === 0;
}

function getMissingProfileFields(state: SetupState) {
  return PROFILE_REQUIRED_FIELDS
    .filter(({ key }) => !String(state[key] ?? '').trim())
    .map(({ label }) => label);
}

function hasBrandGuidance(state: SetupState) {
  return Boolean(
    state.voiceStyle.trim() ||
    state.visualStyle.trim() ||
    state.contentGoals.trim() ||
    state.suggestedContentAngles.trim(),
  );
}

function hasAdvancedAutomationOverride(state: SetupState) {
  const preset = deriveAutopilotFromPreference(state.autopilotPreference);
  return (
    state.autopilotMode !== preset.mode ||
    state.frequency !== preset.frequency ||
    state.approvalMode !== preset.approvalMode
  );
}

function describeAutopilotBehavior(state: SetupState) {
  const cadence = state.frequency === '3x_week' ? 'three times a week' : state.frequency;
  const approval = state.approvalMode === 'auto_schedule' ? 'auto-schedule' : 'wait for approval';
  const fallback = state.allowCopyOnlyFallback ? 'use copy-only fallback' : 'wait for assets';
  return `Pulse will run ${cadence}, stay ${state.autopilotMode}, ${approval}, and ${fallback} when reusable photos are weak.`;
}

function getStepSummary(
  step: SetupStep,
  complete: boolean,
  assetCount: number,
  photosSkipped: boolean,
  missingProfileFields: string[] = [],
  profileConfirmationNeeded = false,
) {
  if (complete) {
    if (step === 'photos') {
      return assetCount > 0 ? `${assetCount} reusable asset${assetCount === 1 ? '' : 's'} ready` : 'Skipped for now';
    }
    return 'Complete';
  }

  switch (step) {
    case 'profile':
      if (missingProfileFields.length > 0) {
        return `Still needed: ${formatInlineList(missingProfileFields.slice(0, 2))}`;
      }
      if (profileConfirmationNeeded) {
        return 'Confirm the profile to finish this step';
      }
      return 'Review the core profile';
    case 'brand':
      return 'Add voice, visual, and content guidance';
    case 'photos':
      return photosSkipped ? 'Skipped for now' : 'Upload reusable venue photos';
    case 'automation':
      return 'Choose how active Pulse should be';
  }
}

function getStickyCopy(
  step: SetupStep,
  photosSkipped: boolean,
  assetCount: number,
  missingProfileFields: string[] = [],
  profileConfirmationNeeded = false,
) {
  switch (step) {
    case 'profile':
      if (missingProfileFields.length > 0) {
        return `Add ${formatInlineList(missingProfileFields)} so Pulse has a complete source of truth for the venue.`;
      }
      if (profileConfirmationNeeded) {
        return 'Everything is filled in. Confirm the profile once to finish this step.';
      }
      return 'Confirm the core profile so Pulse has a clean source of truth for the venue.';
    case 'brand':
      return 'Add a little brand guidance so generated ideas sound more intentional.';
    case 'photos':
      return photosSkipped || assetCount > 0
        ? 'This step is already handled, but you can revisit it before saving.'
        : 'Uploading a few real photos now makes automation much more dependable.';
    case 'automation':
      return 'Choose a Pulse activity level so the system knows how proactive to be after save.';
  }
}

function formatInlineList(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function parseRules(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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
  approvalMode: SetupState['approvalMode'],
): SetupState['autopilotPreference'] {
  if (mode === 'creative' && frequency === 'daily' && approvalMode === 'auto_schedule') return 'active';
  if (mode === 'conservative' && frequency === 'weekly' && approvalMode === 'require_approval') return 'light';
  return 'balanced';
}

function matchAutopilotPreference(
  mode: SetupState['autopilotMode'],
  frequency: SetupState['frequency'],
  approvalMode: SetupState['approvalMode'],
): SetupState['autopilotPreference'] | null {
  if (mode === 'creative' && frequency === 'daily' && approvalMode === 'auto_schedule') return 'active';
  if (mode === 'conservative' && frequency === 'weekly' && approvalMode === 'require_approval') return 'light';
  if (mode === 'conservative' && frequency === '3x_week' && approvalMode === 'require_approval') return 'balanced';
  return null;
}
