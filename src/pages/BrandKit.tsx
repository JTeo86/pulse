import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Palette, Image, UtensilsCrossed, Plus, Star, Trash2, AlertTriangle, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface BrandKit {
  id: string;
  preset: 'casual' | 'midrange' | 'luxury';
  rules_text: string | null;
  example_urls: string[];
}

interface BrandAsset {
  id: string;
  bucket: 'background' | 'crockery';
  storage_path: string;
  is_primary: boolean;
  created_at: string;
}

export default function BrandKitPage() {
  const { currentVenue, isAdmin, isDemoMode } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [backgroundAssets, setBackgroundAssets] = useState<BrandAsset[]>([]);
  const [crockeryAssets, setCrockeryAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newExampleUrl, setNewExampleUrl] = useState('');

  // Helper to check if user can edit and show demo mode warning
  const canEdit = isAdmin && !isDemoMode;

  const showDemoModeWarning = () => {
    toast({
      variant: 'destructive',
      title: 'Demo Mode',
      description: 'Changes cannot be saved while viewing demo data. Create your own brand to save changes.',
    });
  };

  const fetchBrandKit = useCallback(async () => {
    if (!currentVenue) return;

    try {
      const { data: kit, error } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (kit) {
        setBrandKit({
          id: kit.id,
          preset: kit.preset as 'casual' | 'midrange' | 'luxury',
          rules_text: kit.rules_text,
          example_urls: (kit.example_urls as string[]) || [],
        });
      }

      // Fetch brand assets
      const { data: assets, error: assetsError } = await supabase
        .from('brand_assets')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false });

      if (assetsError) throw assetsError;

      const typedAssets = (assets || []) as BrandAsset[];
      setBackgroundAssets(typedAssets.filter(a => a.bucket === 'background'));
      setCrockeryAssets(typedAssets.filter(a => a.bucket === 'crockery'));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading brand kit',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [currentVenue, toast]);

  useEffect(() => {
    fetchBrandKit();
  }, [fetchBrandKit]);

  const handlePresetChange = async (preset: 'casual' | 'midrange' | 'luxury') => {
    if (!brandKit || !isAdmin) return;

    if (isDemoMode) {
      showDemoModeWarning();
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('brand_kits')
        .update({ preset })
        .eq('id', brandKit.id)
        .select();

      if (error) throw error;
      
      // Verify the update actually happened
      if (!data || data.length === 0) {
        throw new Error('Update failed - you may not have permission to edit this brand kit');
      }
      
      setBrandKit({ ...brandKit, preset });
      toast({ title: 'Brand preset updated' });
    } catch (error: any) {
      // Revert local state to match database
      await fetchBrandKit();
      toast({
        variant: 'destructive',
        title: 'Error updating preset',
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRulesChange = async (rules_text: string) => {
    if (!brandKit || !isAdmin) return;

    if (isDemoMode) {
      showDemoModeWarning();
      // Revert local state
      await fetchBrandKit();
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('brand_kits')
        .update({ rules_text })
        .eq('id', brandKit.id)
        .select();

      if (error) throw error;
      
      // Verify the update actually happened
      if (!data || data.length === 0) {
        throw new Error('Update failed - you may not have permission to edit this brand kit');
      }
      
      setBrandKit({ ...brandKit, rules_text });
      toast({ title: 'Brand rules saved' });
    } catch (error: any) {
      // Revert local state to match database
      await fetchBrandKit();
      toast({
        variant: 'destructive',
        title: 'Error saving rules',
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const addExampleUrl = async () => {
    if (!brandKit || !isAdmin || !newExampleUrl.trim()) return;

    if (isDemoMode) {
      showDemoModeWarning();
      return;
    }

    const urls = [...(brandKit.example_urls || []), newExampleUrl.trim()];
    
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('brand_kits')
        .update({ example_urls: urls })
        .eq('id', brandKit.id)
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('Update failed - you may not have permission to edit this brand kit');
      }
      
      setBrandKit({ ...brandKit, example_urls: urls });
      setNewExampleUrl('');
      toast({ title: 'Example added' });
    } catch (error: any) {
      await fetchBrandKit();
      toast({
        variant: 'destructive',
        title: 'Error adding example',
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const removeExampleUrl = async (index: number) => {
    if (!brandKit || !isAdmin) return;

    if (isDemoMode) {
      showDemoModeWarning();
      return;
    }

    const urls = brandKit.example_urls.filter((_, i) => i !== index);
    
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('brand_kits')
        .update({ example_urls: urls })
        .eq('id', brandKit.id)
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('Update failed - you may not have permission to edit this brand kit');
      }
      
      setBrandKit({ ...brandKit, example_urls: urls });
      toast({ title: 'Example removed' });
    } catch (error: any) {
      await fetchBrandKit();
      toast({
        variant: 'destructive',
        title: 'Error removing example',
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const uploadAsset = async (bucket: 'background' | 'crockery', file: File) => {
    if (!currentVenue || !user || !isAdmin) return;

    if (isDemoMode) {
      showDemoModeWarning();
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const storagePath = `venues/${currentVenue.id}/brand/${bucket}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('venue-assets')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data, error: insertError } = await supabase
        .from('brand_assets')
        .insert({
          venue_id: currentVenue.id,
          bucket,
          storage_path: storagePath,
          uploaded_by: user.id,
        })
        .select();

      if (insertError) throw insertError;
      
      if (!data || data.length === 0) {
        // Clean up uploaded file if insert failed
        await supabase.storage.from('venue-assets').remove([storagePath]);
        throw new Error('Insert failed - you may not have permission to add assets');
      }

      await fetchBrandKit();
      toast({ title: 'Asset uploaded' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const togglePrimary = async (asset: BrandAsset) => {
    if (!isAdmin) return;

    if (isDemoMode) {
      showDemoModeWarning();
      return;
    }

    const assets = asset.bucket === 'background' ? backgroundAssets : crockeryAssets;
    const primaryCount = assets.filter(a => a.is_primary).length;

    if (!asset.is_primary && primaryCount >= 3) {
      toast({
        variant: 'destructive',
        title: 'Maximum reached',
        description: 'You can mark up to 3 images as primary',
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('brand_assets')
        .update({ is_primary: !asset.is_primary })
        .eq('id', asset.id)
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('Update failed - you may not have permission to edit this asset');
      }
      
      await fetchBrandKit();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error updating asset',
        description: error.message,
      });
    }
  };

  const deleteAsset = async (asset: BrandAsset) => {
    if (!isAdmin) return;

    if (isDemoMode) {
      showDemoModeWarning();
      return;
    }

    try {
      await supabase.storage
        .from('venue-assets')
        .remove([asset.storage_path]);

      const { data, error } = await supabase
        .from('brand_assets')
        .delete()
        .eq('id', asset.id)
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error('Delete failed - you may not have permission to delete this asset');
      }
      
      await fetchBrandKit();
      toast({ title: 'Asset deleted' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error deleting asset',
        description: error.message,
      });
    }
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('venue-assets').getPublicUrl(path);
    return data.publicUrl;
  };

  const AssetGallery = ({ 
    assets, 
    bucket, 
    title, 
    description 
  }: { 
    assets: BrandAsset[]; 
    bucket: 'background' | 'crockery';
    title: string;
    description: string;
  }) => (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadAsset(bucket, file);
            }}
            disabled={uploading}
            className="max-w-xs"
          />
        </div>
      )}

      {assets.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground">
          <p>No {bucket} images uploaded yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => (
            <div key={asset.id} className="relative group">
              <div className="aspect-square rounded-lg overflow-hidden border border-border">
                <img
                  src={getPublicUrl(asset.storage_path)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              {canEdit && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant={asset.is_primary ? 'default' : 'secondary'}
                    className="w-8 h-8"
                    onClick={() => togglePrimary(asset)}
                  >
                    <Star className={`w-4 h-4 ${asset.is_primary ? 'fill-current' : ''}`} />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="w-8 h-8"
                    onClick={() => deleteAsset(asset)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {asset.is_primary && (
                <div className="absolute bottom-2 left-2 status-chip bg-accent text-accent-foreground">
                  Primary
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <PageHeader
          title="Brand Assets & Identity"
          description="These assets ensure visual consistency across all generated content."
        />

        {/* Informational Callout */}
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 flex items-start gap-3">
          <ImageIcon className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-foreground">
              This section controls <em>how your content looks</em>.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Uploading assets here does not change what the AI says — only how it's presented.
            </p>
          </div>
        </div>

        {/* Demo Mode Warning Banner */}
        {isDemoMode && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-200">You're viewing demo data</p>
              <p className="text-sm text-amber-200/70 mt-1">
                Changes cannot be saved in demo mode. Create your own brand to save your guidelines and assets.
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList>
            <TabsTrigger value="settings" className="gap-2">
              <Palette className="w-4 h-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="backgrounds" className="gap-2">
              <Image className="w-4 h-4" />
              Backgrounds
            </TabsTrigger>
            <TabsTrigger value="crockery" className="gap-2">
              <UtensilsCrossed className="w-4 h-4" />
              Crockery
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6">
            {/* Preset Selector */}
            <div className="card-elevated p-6 space-y-4">
              <div>
                <Label>Brand preset</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Choose the overall tone of your content
                </p>
              </div>
              <Select
                value={brandKit?.preset || 'casual'}
                onValueChange={(value) => handlePresetChange(value as any)}
                disabled={!canEdit || saving}
              >
                <SelectTrigger className="w-full md:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual & Friendly</SelectItem>
                  <SelectItem value="midrange">Professional & Polished</SelectItem>
                  <SelectItem value="luxury">Luxury & Refined</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Brand Rules */}
            <div className="card-elevated p-6 space-y-4">
              <div>
                <Label>Brand guidelines</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Describe your brand voice, restrictions, and preferences
                </p>
              </div>
              <Textarea
                value={brandKit?.rules_text || ''}
                onChange={(e) => setBrandKit(prev => prev ? { ...prev, rules_text: e.target.value } : null)}
                onBlur={(e) => handleRulesChange(e.target.value)}
                placeholder="e.g., Never use emojis. Always mention our signature cocktails. Avoid promotional language..."
                className="min-h-[120px] input-editorial"
                disabled={!canEdit}
              />
            </div>

            {/* Example URLs */}
            <div className="card-elevated p-6 space-y-4">
              <div>
                <Label>Gold standard examples</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Add URLs to posts you consider ideal for your brand
                </p>
              </div>
              
              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    value={newExampleUrl}
                    onChange={(e) => setNewExampleUrl(e.target.value)}
                    placeholder="https://instagram.com/p/..."
                    className="input-editorial"
                  />
                  <Button 
                    onClick={addExampleUrl}
                    disabled={!newExampleUrl.trim() || saving}
                    className="btn-primary-editorial"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {brandKit?.example_urls && brandKit.example_urls.length > 0 && (
                <div className="space-y-2">
                  {brandKit.example_urls.map((url, index) => (
                    <div 
                      key={index}
                      className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg"
                    >
                      <span className="flex-1 truncate text-sm">{url}</span>
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8"
                          onClick={() => removeExampleUrl(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="backgrounds">
            <div className="card-elevated p-6">
              <AssetGallery
                assets={backgroundAssets}
                bucket="background"
                title="Upload Brand Imagery"
                description="Upload photos of your venue's atmosphere, decor, and ambiance. These control the visual style of generated content. Mark up to 3 as primary references."
              />
            </div>
          </TabsContent>

          <TabsContent value="crockery">
            <div className="card-elevated p-6">
              <AssetGallery
                assets={crockeryAssets}
                bucket="crockery"
                title="Upload Presentation Style"
                description="Upload photos of your plates, glasses, and presentation style. These inform how food imagery is styled. Mark up to 3 as primary references."
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Bottom Reassurance Note */}
        <p className="text-xs text-muted-foreground mt-6">
          You can generate content without uploading assets here. If empty, default styling will be used.
        </p>
      </motion.div>
    </AppLayout>
  );
}
