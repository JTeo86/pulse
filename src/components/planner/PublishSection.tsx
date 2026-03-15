import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Calendar, CheckCircle2, Image, Play, Video, Plus, Trash2,
  Send, Clock, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePlanWorkspace, OUTPUT_TYPE_LABELS } from '@/hooks/use-plan-workspace';
import { usePlanPublish, PUBLISH_CHANNELS, PlanPublishItem } from '@/hooks/use-plan-publish';
import { supabase } from '@/integrations/supabase/client';

interface PublishSectionProps {
  planId: string;
  plan: any;
  workspace: ReturnType<typeof usePlanWorkspace>;
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Idea', planned: 'Planned', in_production: 'In Production',
  in_review: 'In Review', approved: 'Approved', scheduled: 'Scheduled',
  done: 'Published', skipped: 'Skipped',
};

export function PublishSection({ planId, plan, workspace }: PublishSectionProps) {
  const navigate = useNavigate();
  const publish = usePlanPublish(planId);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanPublishItem | null>(null);
  const [linkedAssetData, setLinkedAssetData] = useState<Record<string, any>>({});

  // Approved assets ready for publishing
  const approvedAssets = workspace.assets.filter(a => a.status === 'approved');
  const approvedOutputs = workspace.outputs.filter(o => o.status === 'approved');

  // Fetch thumbnails for approved assets
  useEffect(() => {
    const ids = approvedAssets.map(a => a.content_asset_id).filter((id): id is string => !!id);
    if (ids.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('content_assets')
        .select('id, title, asset_type, public_url, thumbnail_url, storage_path')
        .in('id', ids);
      if (data) {
        const map: Record<string, any> = {};
        for (const a of data) {
          let url = a.public_url || a.thumbnail_url || '';
          if (!url && a.storage_path) {
            const { data: signed } = await supabase.storage.from('venue-assets').createSignedUrl(a.storage_path, 3600);
            url = signed?.signedUrl || '';
          }
          map[a.id] = { ...a, _resolvedUrl: url };
        }
        setLinkedAssetData(map);
      }
    })();
  }, [approvedAssets]);

  return (
    <div className="space-y-6">
      {/* Approved outputs ready */}
      {approvedOutputs.length > 0 && (
        <div className="rounded-xl border border-success/20 bg-success/5 p-5 space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" />
            Ready Copy ({approvedOutputs.length})
          </h3>
          {approvedOutputs.map(o => (
            <div key={o.id} className="flex items-center gap-3 p-2 rounded-lg bg-background/50 border border-success/10">
              <span className="text-xs font-medium flex-1">{OUTPUT_TYPE_LABELS[o.output_type] || o.title}</span>
              <Badge className="bg-success/20 text-success text-[10px] border-0">Approved</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Approved assets */}
      {approvedAssets.length > 0 && (
        <div className="rounded-xl border border-success/20 bg-success/5 p-5 space-y-3">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Image className="w-4 h-4 text-success" />
            Approved Assets ({approvedAssets.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {approvedAssets.map(pa => {
              const real = pa.content_asset_id ? linkedAssetData[pa.content_asset_id] : null;
              return (
                <div key={pa.id} className="rounded-lg border border-success/20 bg-background/50 overflow-hidden">
                  {real?._resolvedUrl ? (
                    <img src={real._resolvedUrl} alt="" className="w-full aspect-square object-cover" />
                  ) : (
                    <div className="w-full aspect-square bg-muted flex items-center justify-center">
                      <Image className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-[10px] font-medium truncate">{real?.title || pa.asset_type}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Schedule info */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-medium">Campaign Timeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Event Date</p>
            <p className="text-sm font-medium">{format(new Date(plan.starts_at), 'MMMM dd, yyyy')}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Status</p>
            <p className="text-sm font-medium">{STATUS_LABELS[plan.status] || plan.status}</p>
          </div>
        </div>
      </div>

      {/* Publish queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Publish Queue</h3>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-3 h-3" /> Schedule Post
          </Button>
        </div>

        {publish.items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground rounded-xl border border-dashed border-border">
            <Calendar className="w-6 h-6 mx-auto opacity-40 mb-2" />
            <p className="text-sm">No posts scheduled yet.</p>
            <p className="text-xs mt-1">Approve assets in Production, then add them to the publish queue.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {publish.items.map(item => (
              <PublishItemRow
                key={item.id}
                item={item}
                assetData={item.content_asset_id ? linkedAssetData[item.content_asset_id] : null}
                onEdit={() => setEditingItem(item)}
                onRemove={() => publish.removePublishItem(item.id)}
                onStatusChange={(status) => publish.updatePublishItem(item.id, { status })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Suggested channel plan */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Suggested Channel Plan</h3>
        <div className="space-y-2">
          {[
            { name: 'Instagram Feed', suggested: 'Post 2-3 days before event', icon: Image },
            { name: 'Instagram Stories', suggested: 'Daily during campaign window', icon: Play },
            { name: 'Instagram Reels', suggested: 'Publish 5-7 days before event', icon: Video },
          ].map(ch => (
            <div key={ch.name} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/60">
              <div className="flex items-center gap-3">
                <ch.icon className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{ch.name}</p>
                  <p className="text-xs text-muted-foreground">{ch.suggested}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {publish.items.filter(i => i.channel === ch.name.toLowerCase().replace(/ /g, '_')).length > 0
                  ? 'Scheduled' : 'Pending'}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit dialog */}
      <ScheduleDialog
        open={addDialogOpen || !!editingItem}
        onClose={() => { setAddDialogOpen(false); setEditingItem(null); }}
        item={editingItem}
        approvedAssets={approvedAssets}
        assetData={linkedAssetData}
        approvedOutputs={approvedOutputs}
        onSave={async (data) => {
          if (editingItem) {
            await publish.updatePublishItem(editingItem.id, data);
          } else {
            await publish.addPublishItem({ ...data, plan_asset_id: undefined });
          }
          setAddDialogOpen(false);
          setEditingItem(null);
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────
   PUBLISH ITEM ROW
   ────────────────────────────────────── */
function PublishItemRow({
  item,
  assetData,
  onEdit,
  onRemove,
  onStatusChange,
}: {
  item: PlanPublishItem;
  assetData: any;
  onEdit: () => void;
  onRemove: () => void;
  onStatusChange: (status: string) => void;
}) {
  const channelLabel = PUBLISH_CHANNELS.find(c => c.value === item.channel)?.label || item.channel;
  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    scheduled: 'bg-accent/10 text-accent',
    published: 'bg-success/10 text-success',
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/60 group">
      {assetData?._resolvedUrl ? (
        <img src={assetData._resolvedUrl} alt="" className="w-10 h-10 rounded object-cover" />
      ) : (
        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
          <Send className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{channelLabel}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {item.caption ? item.caption.slice(0, 60) + '...' : 'No caption'}
          {item.publish_date && ` • ${format(new Date(item.publish_date), 'MMM d')}`}
        </p>
      </div>
      <Badge className={`text-[10px] border-0 ${statusColors[item.status] || ''}`}>
        {item.status === 'draft' ? 'Draft' : item.status === 'scheduled' ? 'Scheduled' : 'Published'}
      </Badge>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="w-3 h-3" />
        </Button>
        {item.status === 'draft' && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onStatusChange('scheduled')}>
            <Clock className="w-3 h-3" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────
   SCHEDULE DIALOG
   ────────────────────────────────────── */
function ScheduleDialog({
  open,
  onClose,
  item,
  approvedAssets,
  assetData,
  approvedOutputs,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  item: PlanPublishItem | null;
  approvedAssets: any[];
  assetData: Record<string, any>;
  approvedOutputs: any[];
  onSave: (data: { channel: string; caption: string; publish_date?: string; content_asset_id?: string }) => Promise<void>;
}) {
  const [channel, setChannel] = useState(item?.channel || 'instagram_feed');
  const [caption, setCaption] = useState(item?.caption || '');
  const [publishDate, setPublishDate] = useState(item?.publish_date || '');
  const [selectedAssetId, setSelectedAssetId] = useState(item?.content_asset_id || '');
  const [saving, setSaving] = useState(false);

  // Reset form when item changes
  useEffect(() => {
    setChannel(item?.channel || 'instagram_feed');
    setCaption(item?.caption || '');
    setPublishDate(item?.publish_date || '');
    setSelectedAssetId(item?.content_asset_id || '');
  }, [item, open]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      channel,
      caption,
      publish_date: publishDate || undefined,
      content_asset_id: selectedAssetId || undefined,
    });
    setSaving(false);
  };

  // Pre-fill caption from approved outputs matching channel
  const suggestCaption = () => {
    const channelMap: Record<string, string> = {
      instagram_feed: 'instagram_caption',
      instagram_stories: 'story_text',
      instagram_reels: 'reel_hook',
      email: 'email_body',
      sms: 'sms_push_notification',
    };
    const outputType = channelMap[channel];
    const match = approvedOutputs.find(o => o.output_type === outputType) || approvedOutputs[0];
    if (match) setCaption(match.content);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Publish Item' : 'Schedule Post'}</DialogTitle>
          <DialogDescription>Configure channel, caption, and publish date.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PUBLISH_CHANNELS.map(ch => (
                  <SelectItem key={ch.value} value={ch.value}>{ch.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {approvedAssets.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Asset</Label>
              <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                <SelectTrigger><SelectValue placeholder="Select asset (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {approvedAssets.map(pa => {
                    const real = pa.content_asset_id ? assetData[pa.content_asset_id] : null;
                    return (
                      <SelectItem key={pa.id} value={pa.content_asset_id || pa.id}>
                        {real?.title || pa.asset_type}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Caption</Label>
              {approvedOutputs.length > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={suggestCaption}>
                  Auto-fill from copy
                </Button>
              )}
            </div>
            <Textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4} placeholder="Post caption..." />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Publish Date</Label>
            <Input type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : item ? 'Update' : 'Add to Queue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
