import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Palette, Plus, Star, Trash2, AlertTriangle, FileText, FolderOpen, Info, Loader2, Brain } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';

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
import { StyleIntelligencePanel } from '@/components/style/StyleIntelligencePanel';

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
  const [brandKitFiles, setBrandKitFiles] = useState<BrandKitFile[]>([]);
  const [briefText, setBriefText] = useState('');
  const [savingBrief, setSavingBrief] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      const [kitResult, filesResult] = await Promise.all([
        supabase.from('brand_kits').select('*').eq('venue_id', currentVenue.id).single(),
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title="Brand Identity"
        description="Configure how your brand looks, sounds, and presents itself to the AI."
      />

      {isDemoMode && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
          <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">You're viewing demo data</p>
            <p className="text-sm text-muted-foreground mt-1">
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
          <TabsTrigger value="style" className="gap-2">
            <Brain className="w-4 h-4" />
            Style Intelligence
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

          <p className="text-xs text-muted-foreground">
            If this section is left empty, the AI will use generic hospitality assumptions.
          </p>
        </TabsContent>

        {/* ── Tab 3: Style Intelligence ────────────────────────────── */}
        <TabsContent value="style" className="space-y-6">
          {currentVenue ? (
            <StyleIntelligencePanel
              venueId={currentVenue.id}
              canEdit={canEdit && !isDemoMode}
            />
          ) : (
            <EmptyState
              icon={Brain}
              title="No venue selected"
              description="Select a venue to manage style intelligence references."
            />
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
