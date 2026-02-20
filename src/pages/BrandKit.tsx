import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Palette, Image, UtensilsCrossed, Plus, Star, Trash2, AlertTriangle, FileText, FolderOpen, Info, Loader2 } from 'lucide-react';
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
import { BrandKitUploader } from '@/components/brand/BrandKitUploader';
import { BrandKitFileList } from '@/components/brand/BrandKitFileList';
import { EmptyState } from '@/components/ui/empty-state';

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

interface BrandKitFile {
  id: string;
  file_name: string;
  file_type: string;
  category: string | null;
  storage_path: string;
  size_bytes: number | null;
  created_at: string;
}

export default function BrandKitPage() {
  const { currentVenue, isAdmin, isDemoMode } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [backgroundAssets, setBackgroundAssets] = useState<BrandAsset[]>([]);
  const [crockeryAssets, setCrockeryAssets] = useState<BrandAsset[]>([]);
  const [brandKitFiles, setBrandKitFiles] = useState<BrandKitFile[]>([]);
  // Voice & Messaging local state
  const [briefText, setBriefText] = useState('');
  const [savingBrief, setSavingBrief] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newExampleUrl, setNewExampleUrl] = useState('');

  const canEdit = isAdmin && !isDemoMode;

  const showDemoModeWarning = () => {
    toast({
      variant: 'destructive',
      title: 'Demo Mode',
      description: 'Changes cannot be saved while viewing demo data. Create your own brand to save changes.',
    });
  };

  const fetchAll = useCallback(async () => {
    if (!currentVenue) return;

    try {
      const [kitResult, assetsResult, filesResult] = await Promise.all([
        supabase.from('brand_kits').select('*').eq('venue_id', currentVenue.id).single(),
        supabase.from('brand_assets').select('*').eq('venue_id', currentVenue.id).order('created_at', { ascending: false }),
        supabase.from('brand_kit_files').select('*').eq('venue_id', currentVenue.id).order('created_at', { ascending: false }),
      ]);

      if (kitResult.data) {
        const kit = kitResult.data;
        setBrandKit({
          id: kit.id,
          preset: kit.preset as 'casual' | 'midrange' | 'luxury',
          rules_text: kit.rules_text,
          example_urls: (kit.example_urls as string[]) || [],
        });
        setBriefText(kit.rules_text || '');
      }

      const typedAssets = (assetsResult.data || []) as BrandAsset[];
      setBackgroundAssets(typedAssets.filter(a => a.bucket === 'background'));
      setCrockeryAssets(typedAssets.filter(a => a.bucket === 'crockery'));

      if (filesResult.data) setBrandKitFiles(filesResult.data as BrandKitFile[]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error loading brand identity', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [currentVenue, toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handlePresetChange = async (preset: 'casual' | 'midrange' | 'luxury') => {
    if (!brandKit || !isAdmin) return;
    if (isDemoMode) { showDemoModeWarning(); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('brand_kits').update({ preset }).eq('id', brandKit.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Update failed - you may not have permission');
      setBrandKit({ ...brandKit, preset });
      toast({ title: 'Brand preset updated' });
    } catch (error: any) {
      await fetchAll();
      toast({ variant: 'destructive', title: 'Error updating preset', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleBriefSave = async () => {
    if (!brandKit || !isAdmin) return;
    if (isDemoMode) { showDemoModeWarning(); return; }
    setSavingBrief(true);
    try {
      const { data, error } = await supabase.from('brand_kits').update({ rules_text: briefText }).eq('id', brandKit.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Update failed - you may not have permission');
      setBrandKit({ ...brandKit, rules_text: briefText });
      toast({ title: 'Brand brief saved' });
    } catch (error: any) {
      await fetchAll();
      toast({ variant: 'destructive', title: 'Error saving brief', description: error.message });
    } finally {
      setSavingBrief(false);
    }
  };

  const addExampleUrl = async () => {
    if (!brandKit || !isAdmin || !newExampleUrl.trim()) return;
    if (isDemoMode) { showDemoModeWarning(); return; }
    const urls = [...(brandKit.example_urls || []), newExampleUrl.trim()];
    setSaving(true);
    try {
      const { data, error } = await supabase.from('brand_kits').update({ example_urls: urls }).eq('id', brandKit.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Update failed');
      setBrandKit({ ...brandKit, example_urls: urls });
      setNewExampleUrl('');
      toast({ title: 'Example added' });
    } catch (error: any) {
      await fetchAll();
      toast({ variant: 'destructive', title: 'Error adding example', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const removeExampleUrl = async (index: number) => {
    if (!brandKit || !isAdmin) return;
    if (isDemoMode) { showDemoModeWarning(); return; }
    const urls = brandKit.example_urls.filter((_, i) => i !== index);
    setSaving(true);
    try {
      const { data, error } = await supabase.from('brand_kits').update({ example_urls: urls }).eq('id', brandKit.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Update failed');
      setBrandKit({ ...brandKit, example_urls: urls });
      toast({ title: 'Example removed' });
    } catch (error: any) {
      await fetchAll();
      toast({ variant: 'destructive', title: 'Error removing example', description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const uploadAsset = async (bucket: 'background' | 'crockery', file: File) => {
    if (!currentVenue || !user || !isAdmin) return;
    if (isDemoMode) { showDemoModeWarning(); return; }
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const storagePath = `venues/${currentVenue.id}/brand/${bucket}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('venue-assets').upload(storagePath, file);
      if (uploadError) throw uploadError;

      const { data, error: insertError } = await supabase
        .from('brand_assets')
        .insert({ venue_id: currentVenue.id, bucket, storage_path: storagePath, uploaded_by: user.id })
        .select();

      if (insertError) throw insertError;
      if (!data || data.length === 0) {
        await supabase.storage.from('venue-assets').remove([storagePath]);
        throw new Error('Insert failed - you may not have permission');
      }

      await fetchAll();
      toast({ title: 'Asset uploaded' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const togglePrimary = async (asset: BrandAsset) => {
    if (!isAdmin) return;
    if (isDemoMode) { showDemoModeWarning(); return; }
    const assets = asset.bucket === 'background' ? backgroundAssets : crockeryAssets;
    const primaryCount = assets.filter(a => a.is_primary).length;
    if (!asset.is_primary && primaryCount >= 3) {
      toast({ variant: 'destructive', title: 'Maximum reached', description: 'You can mark up to 3 images as primary' });
      return;
    }
    try {
      const { data, error } = await supabase.from('brand_assets').update({ is_primary: !asset.is_primary }).eq('id', asset.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Update failed');
      await fetchAll();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error updating asset', description: error.message });
    }
  };

  const deleteAsset = async (asset: BrandAsset) => {
    if (!isAdmin) return;
    if (isDemoMode) { showDemoModeWarning(); return; }
    try {
      await supabase.storage.from('venue-assets').remove([asset.storage_path]);
      const { data, error } = await supabase.from('brand_assets').delete().eq('id', asset.id).select();
      if (error) throw error;
      await fetchAll();
      toast({ title: 'Asset deleted' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error deleting asset', description: error.message });
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
    description,
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
                <img src={getPublicUrl(asset.storage_path)} alt="" className="w-full h-full object-cover" />
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
                  <Button size="icon" variant="destructive" className="w-8 h-8" onClick={() => deleteAsset(asset)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {asset.is_primary && (
                <div className="absolute bottom-2 left-2 status-chip bg-accent text-accent-foreground">Primary</div>
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Brand Identity"
          description="Configure how your brand looks, sounds, and presents itself to the AI."
        />

        {isDemoMode && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-200">You're viewing demo data</p>
              <p className="text-sm text-amber-200/70 mt-1">
                Changes cannot be saved in demo mode. Create your own brand to save your settings.
              </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="visual" className="space-y-6">
          <TabsList>
            <TabsTrigger value="visual" className="gap-2">
              <Palette className="w-4 h-4" />
              Visual Identity
            </TabsTrigger>
            <TabsTrigger value="voice" className="gap-2">
              <FileText className="w-4 h-4" />
              Voice & Messaging
            </TabsTrigger>
            <TabsTrigger value="references" className="gap-2">
              <Image className="w-4 h-4" />
              Reference Libraries
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Visual Identity ───────────────────────────────── */}
          <TabsContent value="visual" className="space-y-6">
            <div>
              <h2 className="font-serif text-xl font-medium">Visual Identity</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Upload logos, brand guidelines, fonts, and identity documents. These keep your content visually consistent.
              </p>
            </div>

            {/* Brand Preset */}
            <div className="card-elevated p-6 space-y-4">
              <div>
                <Label>Content style preset</Label>
                <p className="text-sm text-muted-foreground mb-3">Choose the overall tone of your visual content</p>
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

            {/* Brand Kit Files */}
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Brand Kit Files</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Logos, brand guidelines, fonts, and identity documents.
                </p>
              </div>

              {canEdit && currentVenue && (
                <BrandKitUploader venueId={currentVenue.id} onUploadComplete={fetchAll} />
              )}

              {isDemoMode && (
                <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm text-muted-foreground">
                  You're viewing demo data. Sign in and select your brand to upload files.
                </div>
              )}

              {brandKitFiles.length === 0 && !canEdit ? (
                <EmptyState
                  icon={FolderOpen}
                  title="No brand kit files"
                  description="Brand guidelines, logos, and fonts will appear here"
                />
              ) : (
                <BrandKitFileList files={brandKitFiles} canEdit={canEdit} onDeleteComplete={fetchAll} />
              )}
            </div>
          </TabsContent>

          {/* ── Tab 2: Voice & Messaging ─────────────────────────────── */}
          <TabsContent value="voice" className="space-y-6">
            <div>
              <h2 className="font-serif text-xl font-medium">Voice & Messaging</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tell the AI how to write and communicate for your brand. This is the briefing document your AI copywriter reads before every task.
              </p>
            </div>

            <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-foreground">
                  Think of this as the briefing document you'd give a copywriter or marketer.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  The AI uses this to decide <em>what to say</em> — not how things look. The more context, the better it writes in your voice.
                </p>
              </div>
            </div>

            {/* Brand Brief */}
            <div className="card-elevated p-6 space-y-4">
              <div>
                <Label>Brand Brief</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Brand positioning, target audience, tone of voice, key messages, and taglines.
                </p>
              </div>
              <Textarea
                value={briefText}
                onChange={(e) => setBriefText(e.target.value)}
                placeholder="e.g., We are a premium cocktail bar targeting young professionals aged 25–40. Our tone is sophisticated but approachable. We celebrate craft and creativity. Key messages: quality first, no shortcuts, every drink tells a story..."
                className="min-h-[180px] input-editorial"
                disabled={!canEdit}
              />
              {canEdit && (
                <Button
                  onClick={handleBriefSave}
                  disabled={savingBrief}
                  className="btn-primary-editorial"
                >
                  {savingBrief ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                  ) : (
                    'Save Brief'
                  )}
                </Button>
              )}
            </div>

            {/* Gold-standard examples */}
            <div className="card-elevated p-6 space-y-4">
              <div>
                <Label>Gold standard examples</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Add URLs to posts you consider ideal for your brand. The AI uses these as reference points.
                </p>
              </div>

              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    value={newExampleUrl}
                    onChange={(e) => setNewExampleUrl(e.target.value)}
                    placeholder="https://instagram.com/p/..."
                    className="input-editorial"
                    onKeyDown={(e) => e.key === 'Enter' && addExampleUrl()}
                  />
                  <Button onClick={addExampleUrl} disabled={!newExampleUrl.trim() || saving} className="btn-primary-editorial">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {brandKit?.example_urls && brandKit.example_urls.length > 0 ? (
                <div className="space-y-2">
                  {brandKit.example_urls.map((url, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <span className="flex-1 truncate text-sm">{url}</span>
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => removeExampleUrl(index)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No examples added yet.</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              If this section is left empty, the AI will use generic hospitality assumptions.
            </p>
          </TabsContent>

          {/* ── Tab 3: Reference Libraries ───────────────────────────── */}
          <TabsContent value="references" className="space-y-6">
            <div>
              <h2 className="font-serif text-xl font-medium">Reference Libraries</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Upload venue atmosphere images and plating styles. These guide how the AI presents your content visually.
                <span className="ml-1 text-xs text-muted-foreground/70">(Optional — improves AI output quality)</span>
              </p>
            </div>

            <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-start gap-3">
              <Image className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-foreground">
                  These images control <em>how your content looks</em> — not what it says.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Mark up to 3 in each library as "Primary" to guide the AI's visual generation.
                </p>
              </div>
            </div>

            {/* Background Library */}
            <div className="card-elevated p-6">
              <AssetGallery
                assets={backgroundAssets}
                bucket="background"
                title="Venue Atmosphere"
                description="Photos of your venue's atmosphere, decor, and ambiance. Controls the visual environment of generated content. Mark up to 3 as primary references."
              />
            </div>

            {/* Crockery / Plating Library */}
            <div className="card-elevated p-6">
              <AssetGallery
                assets={crockeryAssets}
                bucket="crockery"
                title="Presentation & Plating Style"
                description="Photos of your plates, glasses, and presentation style. Informs how food and drink imagery is styled. Mark up to 3 as primary references."
              />
            </div>

            <p className="text-xs text-muted-foreground">
              You can generate content without uploading assets here. If empty, default styling will be used.
            </p>
          </TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
