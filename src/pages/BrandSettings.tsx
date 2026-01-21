import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Building2, Trash2 } from 'lucide-react';
import { useBrand } from '@/lib/brand-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function BrandSettingsPage() {
  const { currentBrand, isAdmin } = useBrand();
  const [brandName, setBrandName] = useState(currentBrand?.name || '');

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
              <Button className="btn-primary-editorial">
                Save Changes
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
