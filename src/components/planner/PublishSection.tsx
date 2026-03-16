import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Calendar, CheckCircle2, Image, Plus, Package, Bell,
  Clock, Archive, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlanWorkspace } from '@/hooks/use-plan-workspace';
import { usePlanPublish, PlanPublishItem } from '@/hooks/use-plan-publish';
import { supabase } from '@/integrations/supabase/client';
import { generateSuggestedPacks, SuggestedPostPack } from './publish/post-pack-engine';
import { PostPackCard } from './publish/PostPackCard';
import { PostPackDialog } from './publish/PostPackDialog';
import { SuggestionCards } from './publish/SuggestionCards';

interface PublishSectionProps {
  planId: string;
  plan: any;
  workspace: ReturnType<typeof usePlanWorkspace>;
}

export function PublishSection({ planId, plan, workspace }: PublishSectionProps) {
  const publish = usePlanPublish(planId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanPublishItem | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState<SuggestedPostPack | null>(null);
  const [linkedAssetData, setLinkedAssetData] = useState<Record<string, any>>({});

  const approvedAssets = workspace.assets.filter(a => a.status === 'approved');
  const approvedOutputs = workspace.outputs.filter(o => o.status === 'approved');

  // Fetch resolved URLs for all content assets referenced by packs or approved assets
  useEffect(() => {
    const allAssetIds = new Set<string>();
    approvedAssets.forEach(a => { if (a.content_asset_id) allAssetIds.add(a.content_asset_id); });
    publish.items.forEach(i => { if (i.content_asset_id) allAssetIds.add(i.content_asset_id); });
    const ids = Array.from(allAssetIds);
    if (ids.length === 0) return;

    (async () => {
      const { data } = await supabase
        .from('content_assets')
        .select('id, title, asset_type, public_url, thumbnail_url, storage_path')
        .in('id', ids);
      if (data) {
        const map: Record<string, any> = {};
        for (const a of data) {
          const isSignedUrl = (url?: string | null) =>
            url?.includes('/object/sign/') || url?.includes('?token=');
          let url = '';
          if (a.public_url && !isSignedUrl(a.public_url)) url = a.public_url;
          else if (a.thumbnail_url && !isSignedUrl(a.thumbnail_url)) url = a.thumbnail_url;
          if (!url && a.storage_path) {
            const { data: signed } = await supabase.storage.from('venue-assets').createSignedUrl(a.storage_path, 3600);
            url = signed?.signedUrl || '';
          }
          map[a.id] = { ...a, _resolvedUrl: url };
        }
        setLinkedAssetData(map);
      }
    })();
  }, [approvedAssets, publish.items]);

  // Generate suggestions
  const suggestions = useMemo(() => {
    const existingChannels = publish.items
      .filter(i => i.status !== 'archived')
      .map(i => i.channel);
    return generateSuggestedPacks(
      approvedOutputs as any,
      approvedAssets as any,
      existingChannels,
    );
  }, [approvedOutputs, approvedAssets, publish.items]);

  const handleCreateFromSuggestion = (suggestion: SuggestedPostPack) => {
    setActiveSuggestion(suggestion);
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleCreateBlank = () => {
    setActiveSuggestion(null);
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: PlanPublishItem) => {
    setEditingItem(item);
    setActiveSuggestion(null);
    setDialogOpen(true);
  };

  const handleSave = async (data: any) => {
    if (editingItem) {
      await publish.updatePublishItem(editingItem.id, data);
    } else {
      await publish.addPublishItem(data);
    }
    setDialogOpen(false);
    setEditingItem(null);
    setActiveSuggestion(null);
  };

  // Missing items warnings
  const missingItems: string[] = [];
  if (approvedOutputs.length === 0) missingItems.push('No approved copy — approve outputs in Campaign Pack');
  if (approvedAssets.length === 0) missingItems.push('No approved assets — approve assets in Production');

  const hasAnyPacks = publish.items.length > 0;

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-serif font-medium">Post Packs</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ready-to-post content packs for each channel. Copy, download, and post when reminded.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={handleCreateBlank}>
          <Plus className="w-3 h-3" /> Create Pack
        </Button>
      </div>

      {/* Missing items */}
      {missingItems.length > 0 && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h3 className="text-xs font-semibold text-warning">Items needed for publishing</h3>
          </div>
          {missingItems.map((msg, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {msg}</p>
          ))}
        </div>
      )}

      {/* Suggested packs */}
      {suggestions.length > 0 && (
        <SuggestionCards
          suggestions={suggestions}
          onCreatePack={handleCreateFromSuggestion}
        />
      )}

      {/* Campaign timeline */}
      <div className="rounded-xl border bg-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Event</p>
            <p className="text-sm font-medium">{format(new Date(plan.starts_at), 'MMM dd, yyyy')}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Post Packs</p>
            <p className="text-sm font-medium">{publish.items.filter(i => i.status !== 'archived').length} created</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Posted</p>
            <p className="text-sm font-medium">{publish.completedPacks.filter(p => p.status === 'published').length} done</p>
          </div>
        </div>
      </div>

      {/* Post pack lists */}
      {hasAnyPacks ? (
        <Tabs defaultValue="ready" className="space-y-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="ready" className="gap-1.5 text-xs">
              <Package className="w-3.5 h-3.5" />
              Ready ({publish.readyPacks.length})
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="gap-1.5 text-xs">
              <Bell className="w-3.5 h-3.5" />
              Scheduled ({publish.scheduledPacks.length})
            </TabsTrigger>
            <TabsTrigger value="posted" className="gap-1.5 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Posted ({publish.completedPacks.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ready">
            {publish.readyPacks.length === 0 ? (
              <EmptySection
                icon={Package}
                title="No ready post packs"
                description="Create a post pack from the suggestions above or click 'Create Pack'"
              />
            ) : (
              <div className="space-y-3">
                {publish.readyPacks.map(item => (
                  <PostPackCard
                    key={item.id}
                    item={item}
                    assetData={item.content_asset_id ? linkedAssetData[item.content_asset_id] : null}
                    onEdit={() => handleEdit(item)}
                    onMarkPosted={() => publish.markAsPosted(item.id)}
                    onArchive={() => publish.archivePack(item.id)}
                    onRemove={() => publish.removePublishItem(item.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="scheduled">
            {publish.scheduledPacks.length === 0 ? (
              <EmptySection
                icon={Bell}
                title="No scheduled packs"
                description="Set a publish date and reminder when creating a post pack"
              />
            ) : (
              <div className="space-y-3">
                {publish.scheduledPacks.map(item => (
                  <PostPackCard
                    key={item.id}
                    item={item}
                    assetData={item.content_asset_id ? linkedAssetData[item.content_asset_id] : null}
                    onEdit={() => handleEdit(item)}
                    onMarkPosted={() => publish.markAsPosted(item.id)}
                    onArchive={() => publish.archivePack(item.id)}
                    onRemove={() => publish.removePublishItem(item.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="posted">
            {publish.completedPacks.length === 0 ? (
              <EmptySection
                icon={CheckCircle2}
                title="Nothing posted yet"
                description="Post packs you mark as posted will appear here"
              />
            ) : (
              <div className="space-y-3">
                {publish.completedPacks.map(item => (
                  <PostPackCard
                    key={item.id}
                    item={item}
                    assetData={item.content_asset_id ? linkedAssetData[item.content_asset_id] : null}
                    onEdit={() => handleEdit(item)}
                    onMarkPosted={() => publish.markAsPosted(item.id)}
                    onArchive={() => publish.archivePack(item.id)}
                    onRemove={() => publish.removePublishItem(item.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="text-center py-10 rounded-xl border border-dashed border-border">
          <Package className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No post packs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            {suggestions.length > 0
              ? 'Click a suggestion above to get started, or create one manually.'
              : 'Approve copy and assets first, then create post packs for each channel.'}
          </p>
        </div>
      )}

      {/* Dialog */}
      <PostPackDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingItem(null); setActiveSuggestion(null); }}
        editItem={editingItem}
        suggestion={activeSuggestion}
        approvedAssets={approvedAssets}
        assetData={linkedAssetData}
        approvedOutputs={approvedOutputs}
        onSave={handleSave}
      />
    </div>
  );
}

function EmptySection({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Icon className="w-6 h-6 mx-auto opacity-40 mb-2" />
      <p className="text-sm">{title}</p>
      <p className="text-xs mt-1">{description}</p>
    </div>
  );
}
