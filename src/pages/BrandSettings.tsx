import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2, Trash2, AlertTriangle } from 'lucide-react';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function BrandSettingsPage() {
  const { currentVenue: currentBrand, isAdmin, isDemoMode, refreshVenues } = useVenue();
  const { toast } = useToast();
  const [brandName, setBrandName] = useState(currentBrand?.name || '');
  const [saving, setSaving] = useState(false);

  // Sync local state when venue changes
  useEffect(() => {
    setBrandName(currentBrand?.name || '');
  }, [currentBrand?.name]);

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
