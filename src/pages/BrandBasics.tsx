import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Building, MapPin, Globe, Instagram, MessageSquare, Utensils,
  Users, Sparkles, Loader2, AlertTriangle, ArrowRight, Eye,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

interface BrandBasicsForm {
  name: string;
  city: string;
  country_code: string;
  website_url: string;
  instagram_handle: string;
  cuisine_type: string;
  venue_tone: string;
  brand_summary: string;
  target_audience: string;
  key_selling_points: string;
}

const EMPTY_FORM: BrandBasicsForm = {
  name: '',
  city: '',
  country_code: 'GB',
  website_url: '',
  instagram_handle: '',
  cuisine_type: '',
  venue_tone: '',
  brand_summary: '',
  target_audience: '',
  key_selling_points: '',
};

/* ──────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────── */

const CUISINE_OPTIONS = [
  'Modern European', 'Italian', 'French', 'British', 'Mediterranean',
  'Asian Fusion', 'Japanese', 'Chinese', 'Thai', 'Indian',
  'Mexican', 'American', 'Steakhouse', 'Seafood', 'Vegetarian/Vegan',
  'Café/Bakery', 'Bar/Cocktails', 'Fine Dining', 'Casual Dining', 'Other',
];

const TONE_OPTIONS = [
  { value: 'casual', label: 'Casual & Friendly', description: 'Approachable, warm, conversational' },
  { value: 'professional', label: 'Professional & Polished', description: 'Refined, confident, trustworthy' },
  { value: 'luxury', label: 'Luxury & Refined', description: 'Elegant, exclusive, sophisticated' },
  { value: 'playful', label: 'Playful & Bold', description: 'Fun, energetic, memorable' },
];

const COUNTRY_OPTIONS = [
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'AU', label: 'Australia' },
  { code: 'CA', label: 'Canada' },
  { code: 'DE', label: 'Germany' },
  { code: 'ES', label: 'Spain' },
  { code: 'FR', label: 'France' },
  { code: 'IE', label: 'Ireland' },
  { code: 'IT', label: 'Italy' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'PT', label: 'Portugal' },
  { code: 'SG', label: 'Singapore' },
];

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

/** Normalize an Instagram value to just the handle (no @ prefix, no URL). */
function normalizeInstagram(raw: string): string {
  let v = raw.trim();
  // Strip full URL
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  // Strip leading @
  v = v.replace(/^@/, '');
  // Remove trailing slash / query
  v = v.replace(/[/?#].*$/, '');
  return v;
}

/** Ensure a URL has a protocol prefix. */
function normalizeWebsite(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function s(val: string | null | undefined): string {
  return val ?? '';
}

function mapToForm(
  venue: Record<string, any> | null,
  profile: Record<string, any> | null,
): BrandBasicsForm {
  return {
    name: s(venue?.name),
    city: s(venue?.city),
    country_code: s(venue?.country_code) || 'GB',
    website_url: s(venue?.website_url),
    instagram_handle: s(venue?.instagram_handle),
    cuisine_type: s(profile?.cuisine_type),
    venue_tone: s(profile?.venue_tone),
    brand_summary: s(profile?.brand_summary),
    target_audience: s(profile?.target_audience),
    key_selling_points: s(profile?.key_selling_points),
  };
}

/* ──────────────────────────────────────────────
   Component
   ────────────────────────────────────────────── */

export default function BrandBasics() {
  const { currentVenue, isAdmin, isDemoMode } = useVenue();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<BrandBasicsForm>(EMPTY_FORM);
  const [savedSnapshot, setSavedSnapshot] = useState<BrandBasicsForm>(EMPTY_FORM);

  const canEdit = isAdmin && !isDemoMode;
  const isDirty = useMemo(() => JSON.stringify(data) !== JSON.stringify(savedSnapshot), [data, savedSnapshot]);

  /* ── Load ── */
  const fetchData = useCallback(async () => {
    if (!currentVenue) return;
    setLoading(true);
    try {
      const [venueRes, profileRes] = await Promise.all([
        supabase
          .from('venues')
          .select('name, city, country_code, website_url, instagram_handle')
          .eq('id', currentVenue.id)
          .single(),
        supabase
          .from('venue_style_profiles')
          .select('cuisine_type, venue_tone, brand_summary, target_audience, key_selling_points')
          .eq('venue_id', currentVenue.id)
          .single(),
      ]);

      const form = mapToForm(venueRes.data, profileRes.data);
      setData(form);
      setSavedSnapshot(form);
    } catch (error) {
      console.error('Error loading brand basics:', error);
    } finally {
      setLoading(false);
    }
  }, [currentVenue]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Field setter ── */
  const set = <K extends keyof BrandBasicsForm>(key: K, value: BrandBasicsForm[K]) =>
    setData(prev => ({ ...prev, [key]: value }));

  /* ── Save ── */
  const handleSave = async () => {
    if (!currentVenue || !canEdit) return;

    // Validation
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      toast({ variant: 'destructive', title: 'Venue name is required' });
      return;
    }

    setSaving(true);
    try {
      const normalizedWebsite = normalizeWebsite(data.website_url);
      const normalizedInsta = normalizeInstagram(data.instagram_handle);

      // 1. Update venues table
      const { error: venueError } = await supabase
        .from('venues')
        .update({
          name: trimmedName,
          city: data.city.trim() || null,
          country_code: data.country_code,
          website_url: normalizedWebsite || null,
          instagram_handle: normalizedInsta || null,
        })
        .eq('id', currentVenue.id);

      if (venueError) throw venueError;

      // 2. Upsert venue_style_profiles
      const { error: profileError } = await supabase
        .from('venue_style_profiles')
        .upsert({
          venue_id: currentVenue.id,
          cuisine_type: data.cuisine_type || null,
          venue_tone: data.venue_tone || null,
          brand_summary: data.brand_summary.trim() || null,
          target_audience: data.target_audience.trim() || null,
          key_selling_points: data.key_selling_points.trim() || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'venue_id' });

      if (profileError) throw profileError;

      // Update local snapshot with normalized values
      const newSnapshot: BrandBasicsForm = {
        ...data,
        name: trimmedName,
        city: data.city.trim(),
        website_url: normalizedWebsite,
        instagram_handle: normalizedInsta,
        brand_summary: data.brand_summary.trim(),
        target_audience: data.target_audience.trim(),
        key_selling_points: data.key_selling_points.trim(),
      };
      setData(newSnapshot);
      setSavedSnapshot(newSnapshot);

      toast({ title: 'Brand basics saved successfully' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error saving', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-3xl"
    >
      <PageHeader
        title="Brand Basics"
        description="Define your venue's identity. This information helps the AI generate on-brand content and campaigns."
      />

      {isDemoMode && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
          <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Demo Mode</p>
            <p className="text-sm text-muted-foreground">
              Changes cannot be saved. Create your own venue to customize.
            </p>
          </div>
        </div>
      )}

      {/* ── Business Identity ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building className="w-5 h-5 text-accent" />
            Business Identity
          </CardTitle>
          <CardDescription>Core information about your venue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Venue Name <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                value={data.name}
                onChange={e => set('name', e.target.value)}
                disabled={!canEdit}
                placeholder="e.g., The Golden Fork"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City / Location</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="city"
                  value={data.city}
                  onChange={e => set('city', e.target.value)}
                  disabled={!canEdit}
                  placeholder="e.g., London"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select
                value={data.country_code}
                onValueChange={v => set('country_code', v)}
                disabled={!canEdit}
              >
                <SelectTrigger id="country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuisine">Cuisine Type</Label>
              <Select
                value={data.cuisine_type}
                onValueChange={v => set('cuisine_type', v)}
                disabled={!canEdit}
              >
                <SelectTrigger id="cuisine">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="Select cuisine type" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {CUISINE_OPTIONS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Brand Voice ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="w-5 h-5 text-accent" />
            Brand Voice
          </CardTitle>
          <CardDescription>How should the AI communicate for your brand?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tone of Voice</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {TONE_OPTIONS.map(tone => (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() => canEdit && set('venue_tone', tone.value)}
                  disabled={!canEdit}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    data.venue_tone === tone.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  } ${!canEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <p className="font-medium text-sm">{tone.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{tone.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Brand Summary</Label>
            <Textarea
              id="summary"
              value={data.brand_summary}
              onChange={e => set('brand_summary', e.target.value)}
              disabled={!canEdit}
              placeholder="Describe your venue in 2-3 sentences. What makes you unique? What's your story?"
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              This summary helps the AI understand your brand when writing copy.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Target Audience ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-accent" />
            Target Audience
          </CardTitle>
          <CardDescription>Who are you trying to reach?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="audience">Ideal Customer</Label>
            <Textarea
              id="audience"
              value={data.target_audience}
              onChange={e => set('target_audience', e.target.value)}
              disabled={!canEdit}
              placeholder="e.g., Young professionals aged 25-40 who appreciate quality cocktails and a lively atmosphere..."
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Helps the AI tailor tone, language, and campaign targeting.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="selling">Key Selling Points</Label>
            <Textarea
              id="selling"
              value={data.key_selling_points}
              onChange={e => set('key_selling_points', e.target.value)}
              disabled={!canEdit}
              placeholder="e.g., Award-winning cocktails, live jazz on weekends, rooftop terrace with city views..."
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Used in captions, campaign headlines, and marketing recommendations.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Online Presence ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5 text-accent" />
            Online Presence
          </CardTitle>
          <CardDescription>Links for AI research and content scheduling</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="website"
                  value={data.website_url}
                  onChange={e => set('website_url', e.target.value)}
                  disabled={!canEdit}
                  placeholder="https://yourwebsite.com"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">Will be saved with https:// if omitted.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram</Label>
              <div className="relative">
                <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="instagram"
                  value={data.instagram_handle}
                  onChange={e => set('instagram_handle', e.target.value)}
                  disabled={!canEdit}
                  placeholder="yourhandle"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">Enter your handle — @, URLs, etc. will be normalized automatically.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Save Button ── */}
      {canEdit && (
        <div className="flex items-center justify-between pt-4">
          {isDirty && (
            <p className="text-sm text-muted-foreground">You have unsaved changes</p>
          )}
          <div className="ml-auto">
            <Button onClick={handleSave} disabled={saving || !isDirty} className="min-w-[120px]">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Visual Style CTA ── */}
      <Card className="bg-accent/5 border-accent/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Eye className="w-5 h-5 text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Next: Train your visual style</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Upload reference images so the AI learns your venue's visual language across brand, atmosphere, and plating.
                </p>
              </div>
            </div>
            <Link to="/venue/visual-style">
              <Button variant="outline" size="sm" className="gap-1 shrink-0">
                Visual Style <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ── AI Context Note ── */}
      <div className="bg-muted/30 border border-border rounded-lg p-4 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-accent mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">How this helps the AI</p>
          <p className="text-sm text-muted-foreground mt-1">
            This information is used when generating captions, campaign copy, and marketing recommendations.
            The more detail you provide, the more on-brand your AI-generated content will be.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
