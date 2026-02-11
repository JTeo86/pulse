import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2, Trash2, AlertTriangle, MapPin } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const COUNTRY_OPTIONS = [
  { code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' },
  { code: 'IE', name: 'Ireland' }, { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' }, { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' }, { code: 'NL', name: 'Netherlands' },
  { code: 'AU', name: 'Australia' }, { code: 'AE', name: 'UAE' },
];

const TIMEZONE_OPTIONS = [
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Australia/Sydney', 'Asia/Dubai',
];

export default function BrandSettingsPage() {
  const { currentVenue: currentBrand, isAdmin, isDemoMode, refreshVenues } = useVenue();
  const { toast } = useToast();
  const [brandName, setBrandName] = useState(currentBrand?.name || '');
  const [saving, setSaving] = useState(false);

  // Location fields
  const [countryCode, setCountryCode] = useState((currentBrand as any)?.country_code || 'GB');
  const [city, setCity] = useState((currentBrand as any)?.city || '');
  const [timezone, setTimezone] = useState((currentBrand as any)?.timezone || 'Europe/London');
  const [lat, setLat] = useState((currentBrand as any)?.lat?.toString() || '');
  const [lng, setLng] = useState((currentBrand as any)?.lng?.toString() || '');
  const [savingLocation, setSavingLocation] = useState(false);

  // Sync local state when venue changes
  useEffect(() => {
    setBrandName(currentBrand?.name || '');
    setCountryCode((currentBrand as any)?.country_code || 'GB');
    setCity((currentBrand as any)?.city || '');
    setTimezone((currentBrand as any)?.timezone || 'Europe/London');
    setLat((currentBrand as any)?.lat?.toString() || '');
    setLng((currentBrand as any)?.lng?.toString() || '');
  }, [currentBrand]);

  const handleSaveBrandName = async () => {
    if (!currentBrand || !isAdmin) return;

    if (isDemoMode) {
      toast({
        variant: 'destructive',
        title: 'Demo Mode',
        description: 'Changes cannot be saved in demo mode. Create your own brand first.',
      });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('venues')
        .update({ name: brandName })
        .eq('id', currentBrand.id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('Update failed - you may not have permission');
      }

      await refreshVenues();
      toast({ title: 'Brand name updated successfully' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error saving brand name',
        description: error.message,
      });
      setBrandName(currentBrand.name);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <PageHeader
          title="Brand Settings"
          description="Manage your brand configuration"
        />

        {isDemoMode && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6 flex items-start gap-3 max-w-2xl">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-amber-200 font-medium">Demo Mode</p>
              <p className="text-amber-200/70 text-sm">
                You're viewing demo data. Create your own brand to save changes.
              </p>
            </div>
          </div>
        )}

        <div className="max-w-2xl space-y-8">
          {/* Brand Info */}
          <div className="card-elevated p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-medium">Brand Information</h3>
                <p className="text-sm text-muted-foreground">Basic brand details</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand Name</Label>
                <Input
                  id="brandName"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="input-editorial"
                  disabled={!isAdmin}
                />
              </div>

              <div className="space-y-2">
                <Label>Plan</Label>
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <span className="text-sm capitalize">{currentBrand?.plan || 'Free'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Brand ID</Label>
                <div className="p-3 rounded-lg bg-muted/50 border border-border font-mono text-xs text-muted-foreground">
                  {currentBrand?.id}
                </div>
              </div>
            </div>

            {isAdmin && (
              <Button 
                className="btn-primary-editorial" 
                onClick={handleSaveBrandName}
                disabled={saving || brandName === currentBrand?.name}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </div>

          {/* Location Settings */}
          {isAdmin && (
            <div className="card-elevated p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-medium">Location</h3>
                  <p className="text-sm text-muted-foreground">Used for Events Planner and local content</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map(c => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g., London" />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONE_OPTIONS.map(tz => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Latitude</Label>
                    <Input value={lat} onChange={e => setLat(e.target.value)} placeholder="51.5074" />
                  </div>
                  <div className="space-y-2">
                    <Label>Longitude</Label>
                    <Input value={lng} onChange={e => setLng(e.target.value)} placeholder="-0.1278" />
                  </div>
                </div>
              </div>

              <Button
                className="btn-primary-editorial"
                disabled={savingLocation}
                onClick={async () => {
                  if (!currentBrand) return;
                  setSavingLocation(true);
                  try {
                    const updates: any = {
                      country_code: countryCode,
                      city: city || null,
                      timezone,
                      lat: lat ? parseFloat(lat) : null,
                      lng: lng ? parseFloat(lng) : null,
                    };
                    const { error } = await supabase
                      .from('venues')
                      .update(updates)
                      .eq('id', currentBrand.id);
                    if (error) throw error;
                    await refreshVenues();
                    toast({ title: 'Location updated' });
                  } catch (err: any) {
                    toast({ variant: 'destructive', title: 'Error', description: err.message });
                  } finally {
                    setSavingLocation(false);
                  }
                }}
              >
                {savingLocation ? 'Saving...' : 'Save Location'}
              </Button>
            </div>
          )}

          {/* Danger Zone */}
          {isAdmin && (
            <div className="card-elevated border-destructive/30 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <h3 className="font-medium text-destructive">Danger Zone</h3>
                  <p className="text-sm text-muted-foreground">Irreversible actions</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete this brand</p>
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete all brand data, content, and assets.
                  </p>
                </div>
                <Button variant="destructive" size="sm">
                  Delete Brand
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AppLayout>
  );
}
