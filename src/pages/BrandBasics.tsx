import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Building, MapPin, Globe, Instagram, Target, MessageSquare, Utensils, Users, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
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

interface BrandBasicsData {
  name: string;
  city: string | null;
  country_code: string;
  cuisine_type: string | null;
  venue_tone: string | null;
  brand_summary: string | null;
  target_audience: string | null;
  key_selling_points: string | null;
  website_url: string | null;
  instagram_handle: string | null;
}

const CUISINE_OPTIONS = [
  'Modern European', 'Italian', 'French', 'British', 'Mediterranean',
  'Asian Fusion', 'Japanese', 'Chinese', 'Thai', 'Indian',
  'Mexican', 'American', 'Steakhouse', 'Seafood', 'Vegetarian/Vegan',
  'Café/Bakery', 'Bar/Cocktails', 'Fine Dining', 'Casual Dining', 'Other'
];

const TONE_OPTIONS = [
  { value: 'casual', label: 'Casual & Friendly', description: 'Approachable, warm, conversational' },
  { value: 'professional', label: 'Professional & Polished', description: 'Refined, confident, trustworthy' },
  { value: 'luxury', label: 'Luxury & Refined', description: 'Elegant, exclusive, sophisticated' },
  { value: 'playful', label: 'Playful & Bold', description: 'Fun, energetic, memorable' },
];

export default function BrandBasics() {
  const { currentVenue, isAdmin, isDemoMode } = useVenue();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<BrandBasicsData>({
    name: '',
    city: null,
    country_code: 'GB',
    cuisine_type: null,
    venue_tone: null,
    brand_summary: null,
    target_audience: null,
    key_selling_points: null,
    website_url: null,
    instagram_handle: null,
  });

  const canEdit = isAdmin && !isDemoMode;

  const fetchData = useCallback(async () => {
    if (!currentVenue) return;
    setLoading(true);
    try {
      // Fetch venue basic info
      const { data: venueData } = await supabase
        .from('venues')
        .select('name, city, country_code')
        .eq('id', currentVenue.id)
        .single();

      // Fetch style profile for brand-related fields
      const { data: profileData } = await supabase
        .from('venue_style_profiles')
        .select('cuisine_type, venue_tone, brand_summary')
        .eq('venue_id', currentVenue.id)
        .single();

      // Fetch brand kit for additional info
      const { data: brandKit } = await supabase
        .from('brand_kits')
        .select('rules_text, example_urls')
        .eq('venue_id', currentVenue.id)
        .single();

      setData({
        name: venueData?.name || currentVenue.name,
        city: venueData?.city || null,
        country_code: venueData?.country_code || 'GB',
        cuisine_type: profileData?.cuisine_type || null,
        venue_tone: profileData?.venue_tone || null,
        brand_summary: profileData?.brand_summary || null,
        target_audience: null, // Can be extracted from brand_kit rules_text if structured
        key_selling_points: null,
        website_url: null,
        instagram_handle: null,
      });
    } catch (error) {
      console.error('Error loading brand basics:', error);
    } finally {
      setLoading(false);
    }
  }, [currentVenue]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!currentVenue || !canEdit) return;
    setSaving(true);
    try {
      // Update venue basic info
      const { error: venueError } = await supabase
        .from('venues')
        .update({
          name: data.name,
          city: data.city,
        })
        .eq('id', currentVenue.id);

      if (venueError) throw venueError;

      // Upsert style profile
      const { error: profileError } = await supabase
        .from('venue_style_profiles')
        .upsert({
          venue_id: currentVenue.id,
          cuisine_type: data.cuisine_type,
          venue_tone: data.venue_tone,
          brand_summary: data.brand_summary,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'venue_id' });

      if (profileError) throw profileError;

      toast({ title: 'Brand basics saved successfully' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error saving', description: error.message });
    } finally {
      setSaving(false);
    }
  };

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

      {/* Business Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building className="w-5 h-5 text-accent" />
            Business Identity
          </CardTitle>
          <CardDescription>
            Core information about your venue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Venue Name</Label>
              <Input
                id="name"
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
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
                  value={data.city || ''}
                  onChange={(e) => setData({ ...data, city: e.target.value })}
                  disabled={!canEdit}
                  placeholder="e.g., London"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cuisine">Cuisine Type</Label>
            <Select
              value={data.cuisine_type || ''}
              onValueChange={(value) => setData({ ...data, cuisine_type: value })}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="Select cuisine type" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {CUISINE_OPTIONS.map((cuisine) => (
                  <SelectItem key={cuisine} value={cuisine}>{cuisine}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Brand Voice */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="w-5 h-5 text-accent" />
            Brand Voice
          </CardTitle>
          <CardDescription>
            How should the AI communicate for your brand?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tone of Voice</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {TONE_OPTIONS.map((tone) => (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() => canEdit && setData({ ...data, venue_tone: tone.value })}
                  disabled={!canEdit}
                  className={`
                    p-4 rounded-lg border text-left transition-all
                    ${data.venue_tone === tone.value 
                      ? 'border-accent bg-accent/10' 
                      : 'border-border hover:border-accent/50'
                    }
                    ${!canEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                  `}
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
              value={data.brand_summary || ''}
              onChange={(e) => setData({ ...data, brand_summary: e.target.value })}
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

      {/* Target Audience */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-accent" />
            Target Audience
          </CardTitle>
          <CardDescription>
            Who are you trying to reach?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="audience">Ideal Customer</Label>
            <Textarea
              id="audience"
              value={data.target_audience || ''}
              onChange={(e) => setData({ ...data, target_audience: e.target.value })}
              disabled={!canEdit}
              placeholder="e.g., Young professionals aged 25-40 who appreciate quality cocktails and a lively atmosphere..."
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="selling">Key Selling Points</Label>
            <Textarea
              id="selling"
              value={data.key_selling_points || ''}
              onChange={(e) => setData({ ...data, key_selling_points: e.target.value })}
              disabled={!canEdit}
              placeholder="e.g., Award-winning cocktails, live jazz on weekends, rooftop terrace with city views..."
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Online Presence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5 text-accent" />
            Online Presence
          </CardTitle>
          <CardDescription>
            Links for AI research and content scheduling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="website"
                  value={data.website_url || ''}
                  onChange={(e) => setData({ ...data, website_url: e.target.value })}
                  disabled={!canEdit}
                  placeholder="https://yourwebsite.com"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram</Label>
              <div className="relative">
                <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="instagram"
                  value={data.instagram_handle || ''}
                  onChange={(e) => setData({ ...data, instagram_handle: e.target.value })}
                  disabled={!canEdit}
                  placeholder="@yourhandle"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      {canEdit && (
        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      )}

      {/* AI Context Note */}
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 flex items-start gap-3">
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
