import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Calendar, CheckCircle2, Image, Plus, Package, Bell,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePlanWorkspace } from '@/hooks/use-plan-workspace';
import { usePlanPublish, PlanPublishItem } from '@/hooks/use-plan-publish';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { generateSuggestedPacks, SuggestedPostPack } from './publish/post-pack-engine';
import { PostPackCard } from './publish/PostPackCard';
import { PostPackDialog } from './publish/PostPackDialog';
import { SuggestionCards } from './publish/SuggestionCards';

interface PublishSectionProps {
  planId: string;
  plan: any;
  workspace: ReturnType<typeof usePlanWorkspace>;
  publish: ReturnType<typeof usePlanPublish>;
}

export function PublishSection({ planId, plan, workspace, publish }: PublishSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanPublishItem | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState<SuggestedPostPack | null>(null);
  const [linkedAssetData, setLinkedAssetData] = useState<Record<string, any>>({});

  // All plan-linked assets & outputs — dialog uses preference ordering (starred first)
  const allPlanAssets = workspace.assets.filter(a => a.content_asset_id);
  const allPlanOutputs = workspace.outputs;
  // For suggestions: use all available content (prefer starred/approved but don't gate on it)
  const availableAssets = workspace.assets.filter(a => a.content_asset_id);
  const availableOutputs = workspace.outputs;

  // Fetch resolved URLs for all content assets referenced by packs or approved assets
  useEffect(() => {
    const allAssetIds = new Set<string>();
    allPlanAssets.forEach(a => { if (a.content_asset_id) allAssetIds.add(a.content_asset_id); });
    publish.items.forEach(i => { if (i.content_asset_id) allAssetIds.add(i.content_asset_id); });
    const ids = Array.from(allAssetIds);
    if (ids.length === 0) return;

    (async () => {
      const { data } = await supabase
        .from('content_assets')
        .select('id, title, asset_type, public_url, thumbnail_url, storage_path, storage_bucket, created_at')
        .in('id', ids);
      if (data) {
        const map: Record<string, any> = {};
        for (const a of data) {
          const isSignedUrl = (url?: string | null) =>
            url?.includes('/object/sign/') || url?.includes('?token=');
          let url = '';
          if (a.thumbnail_url && !isSignedUrl(a.thumbnail_url)) url = a.thumbnail_url;
          else if (a.public_url && !isSignedUrl(a.public_url)) url = a.public_url;
          if (!url && a.storage_path) {
            const { data: signed } = await supabase.storage.from(a.storage_bucket || 'venue-assets').createSignedUrl(a.storage_path, 3600);
            url = signed?.signedUrl || '';
          }
          map[a.id] = { ...a, _resolvedUrl: url };
        }
        setLinkedAssetData(map);
      }
    })();
  }, [allPlanAssets, publish.items]);

  // Generate suggestions from all available content (not just approved)
  const suggestions = useMemo(() => {
    const existingChannels = publish.items
      .filter(i => i.status !== 'archived')
      .map(i => i.channel);
    return generateSuggestedPacks(
      availableOutputs as any,
      availableAssets as any,
      existingChannels,
    );
  }, [availableOutputs, availableAssets, publish.items]);

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
    // Resolve asset URL for calendar sync
    const assetUrl = data.content_asset_id ? linkedAssetData[data.content_asset_id]?._resolvedUrl : null;
    if (editingItem) {
      await publish.updatePublishItem(editingItem.id, data, assetUrl, plan?.title);
    } else {
      await publish.addPublishItem(data, assetUrl, plan?.title);
    }
    setDialogOpen(false);
    setEditingItem(null);
    setActiveSuggestion(null);
  };

  // Helpful hints (not blockers)
  const hints: string[] = [];
  if (availableOutputs.length === 0) hints.push('No copy generated yet — generate content in the Create step first.');
  if (availableAssets.length === 0 && availableOutputs.length > 0) hints.push('No assets linked yet — create or attach assets in the Create step.');

  const hasAnyPacks = publish.items.length > 0;
  const hasReadyContent = availableOutputs.length > 0 || availableAssets.length > 0;
  const canCreatePostPacks = hasReadyContent || hasAnyPacks;

  // Real posting progress
  const activePacks = publish.items.filter(i => i.status !== 'archived');
  const totalPacks = activePacks.length;
  const postedPacks = activePacks.filter(i => i.status === 'published').length;
  const allPosted = totalPacks > 0 && postedPacks === totalPacks;
  const progressPercent = totalPacks > 0 ? Math.round((postedPacks / totalPacks) * 100) : 0;
  const suggestedPost = suggestions.find(s => s.suggestedCaption && s.suggestedAssetId);
  const suggestedAsset = suggestedPost?.suggestedAssetId ? linkedAssetData[suggestedPost.suggestedAssetId] : null;

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-serif font-medium">Prepare Posts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Build channel-ready posts for this campaign. Add them to your Calendar when ready to schedule.
          </p>
        </div>
        {canCreatePostPacks && (
          <Button size="sm" className="gap-2" onClick={handleCreateBlank}>
            <Plus className="w-3 h-3" /> Create Post
          </Button>
        )}
      </div>

      {suggestedPost && suggestedAsset && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Suggested post</p>
              <p className="text-xs text-muted-foreground">Pulse paired a caption and image to help you move faster.</p>
            </div>
            <Badge variant="secondary">{suggestedPost.channelLabel}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
            {suggestedAsset._resolvedUrl ? (
              <img
                src={suggestedAsset._resolvedUrl}
                alt={suggestedAsset.title || 'Suggested asset'}
                className="w-full h-[120px] rounded-lg object-cover border border-border/50"
              />
            ) : (
              <div className="w-full h-[120px] rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground">
                <Image className="w-4 h-4" />
              </div>
            )}
            <div className="space-y-3">
              <p className="text-sm text-foreground line-clamp-4 whitespace-pre-wrap">{suggestedPost.suggestedCaption}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => handleCreateFromSuggestion(suggestedPost)}>Add to Calendar</Button>
                <Button size="sm" variant="outline" onClick={() => handleCreateFromSuggestion(suggestedPost)}>Edit</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Posting progress */}
      {totalPacks > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Posting Progress</p>
            <span className="text-xs font-medium text-foreground">{postedPacks} / {totalPacks} published</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          {allPosted && (
            <div className="flex items-center gap-2 pt-1">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <p className="text-sm font-medium text-success">Campaign posting completed</p>
            </div>
          )}
        </div>
      )}

      {/* Helpful hints (not blockers) */}
      {hints.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground">Tips</h3>
          </div>
          {hints.map((msg, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {msg}</p>
          ))}
        </div>
      )}

      {/* Suggested packs */}
      {canCreatePostPacks && suggestions.length > 0 && (
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
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Prepared Posts</p>
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
                title="No ready posts"
                description="Create a post from the suggestions above or click 'Create Post'"
              />
            ) : (
              <div className="space-y-3">
                {publish.readyPacks.map(item => {
                  const asset = item.content_asset_id ? linkedAssetData[item.content_asset_id] : null;
                  return (
                    <PostPackCard
                      key={item.id}
                      item={item}
                      planTitle={plan?.title}
                      assetData={asset}
                      onEdit={() => handleEdit(item)}
                      onMarkPosted={() => publish.markAsPosted(item.id, asset?._resolvedUrl, plan?.title)}
                      onArchive={() => publish.archivePack(item.id)}
                      onRemove={() => publish.removePublishItem(item.id)}
                      onStatusChange={() => publish.fetchItems()}
                    />
                  );
                })}
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
                {publish.scheduledPacks.map(item => {
                  const asset = item.content_asset_id ? linkedAssetData[item.content_asset_id] : null;
                  return (
                    <PostPackCard
                      key={item.id}
                      item={item}
                      planTitle={plan?.title}
                      assetData={asset}
                      onEdit={() => handleEdit(item)}
                      onMarkPosted={() => publish.markAsPosted(item.id, asset?._resolvedUrl, plan?.title)}
                      onArchive={() => publish.archivePack(item.id)}
                      onRemove={() => publish.removePublishItem(item.id)}
                      onStatusChange={() => publish.fetchItems()}
                    />
                  );
                })}
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
                {publish.completedPacks.map(item => {
                  const asset = item.content_asset_id ? linkedAssetData[item.content_asset_id] : null;
                  return (
                    <PostPackCard
                      key={item.id}
                      item={item}
                      planTitle={plan?.title}
                      assetData={asset}
                      onEdit={() => handleEdit(item)}
                      onMarkPosted={() => publish.markAsPosted(item.id, asset?._resolvedUrl, plan?.title)}
                      onArchive={() => publish.archivePack(item.id)}
                      onRemove={() => publish.removePublishItem(item.id)}
                      onStatusChange={() => publish.fetchItems()}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="text-center py-10 rounded-xl border border-dashed border-border">
          <Package className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No post packs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            {canCreatePostPacks
              ? suggestions.length > 0
                ? 'Click a suggestion above to get started, or create one manually.'
                : 'Create a post pack to add it to your calendar and queue it for publishing.'
              : 'Generate content or link assets in the Create step before creating post packs.'}
          </p>
        </div>
      )}

      {/* Dialog */}
      <PostPackDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingItem(null); setActiveSuggestion(null); }}
        editItem={editingItem}
        suggestion={activeSuggestion}
        planTitle={plan?.title || ''}
        approvedAssets={allPlanAssets}
        assetData={linkedAssetData}
        approvedOutputs={allPlanOutputs}
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
