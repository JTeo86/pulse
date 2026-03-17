import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Bell, Sparkles, Image as ImageIcon, ChevronDown, Check,
  Camera, Play, Video, Mail, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { PUBLISH_CHANNELS, PlanPublishItem, CHANNEL_COPY_MAP, CHANNEL_ASSET_MAP } from '@/hooks/use-plan-publish';
import { OUTPUT_TYPE_LABELS } from '@/hooks/use-plan-workspace';
import { SuggestedPostPack } from './post-pack-engine';

interface PostPackDialogProps {
  open: boolean;
  onClose: () => void;
  editItem: PlanPublishItem | null;
  suggestion: SuggestedPostPack | null;
  planTitle: string;
  approvedAssets: any[];
  assetData: Record<string, any>;
  approvedOutputs: any[];
  onSave: (data: {
    channel: string;
    pack_type: string;
    title: string;
    caption: string;
    publish_date?: string;
    reminder_at?: string;
    content_asset_id?: string;
    plan_asset_id?: string;
    status?: string;
    metadata?: Record<string, any>;
  }) => Promise<void>;
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  instagram_feed: Camera,
  instagram_stories: Play,
  instagram_reels: Video,
  tiktok: Video,
  email: Mail,
  sms: MessageSquare,
};

/** Build a smart title from plan title + channel */
function buildPackTitle(planTitle: string, channelValue: string): string {
  const ch = PUBLISH_CHANNELS.find(c => c.value === channelValue);
  const channelSuffix = ch
    ? channelValue === 'sms'
      ? 'SMS / Push Pack'
      : channelValue === 'email'
      ? 'Email Pack'
      : channelValue.startsWith('instagram_reels')
      ? 'Instagram Reel Pack'
      : channelValue.startsWith('instagram_stories')
      ? 'Instagram Story Pack'
      : channelValue.startsWith('instagram_feed')
      ? 'Instagram Feed Pack'
      : channelValue === 'tiktok'
      ? 'TikTok Pack'
      : `${ch.label} Pack`
    : 'Post Pack';

  const base = planTitle
    ? `${planTitle} — ${channelSuffix}`
    : channelSuffix;
  return base;
}

/** Find best caption for a channel from approved outputs */
function findBestCaption(channel: string, outputs: any[]): { content: string; outputType: string; outputId: string } | null {
  const copyTypes = CHANNEL_COPY_MAP[channel] || [];
  for (const copyType of copyTypes) {
    const match = outputs.find((o: any) => o.output_type === copyType);
    if (match) return { content: match.content, outputType: match.output_type, outputId: match.id };
  }
  if (outputs.length > 0) {
    const fb = outputs[0];
    return { content: fb.content, outputType: fb.output_type, outputId: fb.id };
  }
  return null;
}

/** Find best asset for a channel from approved plan assets */
function findBestAsset(channel: string, assets: any[]): { contentAssetId: string; planAssetId: string } | null {
  const assetTypes = CHANNEL_ASSET_MAP[channel] || [];
  for (const assetType of assetTypes) {
    const match = assets.find((a: any) => a.asset_type === assetType && a.content_asset_id);
    if (match) return { contentAssetId: match.content_asset_id, planAssetId: match.id };
  }
  const fb = assets.find((a: any) => a.content_asset_id);
  if (fb) return { contentAssetId: fb.content_asset_id, planAssetId: fb.id };
  return null;
}

export function PostPackDialog({
  open,
  onClose,
  editItem,
  suggestion,
  planTitle,
  approvedAssets,
  assetData,
  approvedOutputs,
  onSave,
}: PostPackDialogProps) {
  const [channel, setChannel] = useState('instagram_feed');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('12:00');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedPlanAssetId, setSelectedPlanAssetId] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(30);
  const [saving, setSaving] = useState(false);
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);

  // Eligible outputs for the current channel (ordered by relevance)
  const eligibleOutputs = useMemo(() => {
    const copyTypes = CHANNEL_COPY_MAP[channel] || [];
    const preferred = copyTypes
      .map(ct => approvedOutputs.find((o: any) => o.output_type === ct))
      .filter(Boolean);
    const rest = approvedOutputs.filter((o: any) => !preferred.some((p: any) => p.id === o.id));
    return [...preferred, ...rest];
  }, [channel, approvedOutputs]);

  // Auto-assemble when dialog opens or channel changes (for new packs only)
  const autoAssemble = (ch: string, isInit: boolean) => {
    // Auto title
    if (!titleManuallyEdited || isInit) {
      setTitle(buildPackTitle(planTitle, ch));
    }

    // Auto caption
    const bestCopy = findBestCaption(ch, approvedOutputs);
    if (bestCopy) {
      setCaption(bestCopy.content);
      setSelectedOutputId(bestCopy.outputId);
    } else {
      setCaption('');
      setSelectedOutputId('');
    }

    // Auto asset
    const isEmail = ch === 'email';
    const isSms = ch === 'sms';
    if (!isSms) {
      const bestAsset = findBestAsset(ch, approvedAssets);
      if (bestAsset) {
        setSelectedAssetId(bestAsset.contentAssetId);
        setSelectedPlanAssetId(bestAsset.planAssetId);
      } else {
        setSelectedAssetId('');
        setSelectedPlanAssetId('');
      }
    } else {
      setSelectedAssetId('');
      setSelectedPlanAssetId('');
    }
  };

  // Reset / prefill form on open
  useEffect(() => {
    if (!open) return;
    setTitleManuallyEdited(false);

    if (editItem) {
      setChannel(editItem.channel);
      setTitle(editItem.title || '');
      setCaption(editItem.caption || '');
      setSelectedOutputId((editItem.metadata as any)?.source_output_id || '');
      if (editItem.publish_date) {
        const d = new Date(editItem.publish_date);
        setPublishDate(format(d, 'yyyy-MM-dd'));
        setPublishTime(format(d, 'HH:mm'));
      } else {
        setPublishDate('');
        setPublishTime('12:00');
      }
      setSelectedAssetId(editItem.content_asset_id || '');
      setSelectedPlanAssetId(editItem.plan_asset_id || '');
      setReminderEnabled(!!editItem.reminder_at);
      setTitleManuallyEdited(true);
    } else if (suggestion) {
      setChannel(suggestion.channel);
      setTitle(buildPackTitle(planTitle, suggestion.channel));
      setCaption(suggestion.suggestedCaption);
      setSelectedOutputId('');
      setSelectedAssetId(suggestion.suggestedAssetId || '');
      setSelectedPlanAssetId(suggestion.suggestedPlanAssetId || '');
      setPublishDate('');
      setPublishTime('12:00');
      setReminderEnabled(false);
    } else {
      // Blank create — auto-assemble for default channel
      const defaultCh = 'instagram_feed';
      setChannel(defaultCh);
      setPublishDate('');
      setPublishTime('12:00');
      setReminderEnabled(false);
      autoAssemble(defaultCh, true);
    }
  }, [editItem, suggestion, open]);

  // When channel changes (user action), re-assemble if not editing
  const handleChannelChange = (ch: string) => {
    setChannel(ch);
    if (!editItem) {
      setTitleManuallyEdited(false);
      autoAssemble(ch, false);
    } else {
      // Even in edit mode, update title if it still matches old auto pattern
      if (!titleManuallyEdited) {
        setTitle(buildPackTitle(planTitle, ch));
      }
    }
  };

  // When user selects a different output
  const handleOutputChange = (outputId: string) => {
    setSelectedOutputId(outputId);
    const output = approvedOutputs.find((o: any) => o.id === outputId);
    if (output) {
      setCaption(output.content);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let publishDateIso: string | undefined;
      if (publishDate) {
        publishDateIso = new Date(`${publishDate}T${publishTime}`).toISOString();
      }

      let reminderAt: string | undefined;
      if (reminderEnabled && publishDateIso) {
        const reminderDate = new Date(publishDateIso);
        reminderDate.setMinutes(reminderDate.getMinutes() - reminderMinutesBefore);
        reminderAt = reminderDate.toISOString();
      }

      const channelConfig = PUBLISH_CHANNELS.find(c => c.value === channel);

      await onSave({
        channel,
        pack_type: channelConfig?.category || 'social',
        title: title || buildPackTitle(planTitle, channel),
        caption,
        publish_date: publishDateIso,
        reminder_at: reminderAt,
        content_asset_id: selectedAssetId || undefined,
        plan_asset_id: selectedPlanAssetId || undefined,
        status: publishDateIso ? 'scheduled' : 'ready',
        metadata: {
          source_output_type: selectedOutputId
            ? approvedOutputs.find((o: any) => o.id === selectedOutputId)?.output_type
            : suggestion?.suggestedCaptionSource || null,
          source_output_id: selectedOutputId || null,
          source_plan_asset_id: selectedPlanAssetId || null,
          reminder_enabled: reminderEnabled,
          suggested_channel_reason: suggestion?.reason || null,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const channelConfig = PUBLISH_CHANNELS.find(c => c.value === channel);
  const isEmail = channel === 'email';
  const isSms = channel === 'sms';
  const ChannelIcon = CHANNEL_ICONS[channel] || ImageIcon;
  const selectedAsset = selectedAssetId ? assetData[selectedAssetId] : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? 'Edit Post Pack' : 'Create Post Pack'}</DialogTitle>
          <DialogDescription>
            {editItem
              ? 'Update this post pack before publishing.'
              : 'Pulse auto-assembled this pack from your approved copy and assets. Review and save.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1. Channel */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Channel</Label>
            <Select value={channel} onValueChange={handleChannelChange}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PUBLISH_CHANNELS.map(ch => {
                  const Icon = CHANNEL_ICONS[ch.value] || ImageIcon;
                  return (
                    <SelectItem key={ch.value} value={ch.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" />
                        {ch.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Auto-generated title */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Pack Title</Label>
            <Input
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                setTitleManuallyEdited(true);
              }}
              placeholder={buildPackTitle(planTitle, channel)}
              className="h-9 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">Auto-generated from your plan. Edit if needed.</p>
          </div>

          {/* 3. Asset from Production */}
          {!isSms && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Asset from Production</Label>
              {approvedAssets.length > 0 ? (
                <div className="space-y-2">
                  <Select value={selectedAssetId} onValueChange={v => {
                    setSelectedAssetId(v);
                    const pa = approvedAssets.find((a: any) => (a.content_asset_id || a.id) === v);
                    if (pa) setSelectedPlanAssetId(pa.id);
                  }}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose approved asset" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {approvedAssets.map((pa: any) => {
                        const real = pa.content_asset_id ? assetData[pa.content_asset_id] : null;
                        return (
                          <SelectItem key={pa.id} value={pa.content_asset_id || pa.id}>
                            {real?.title || pa.asset_type} — {pa.asset_type} {pa.status === 'approved' ? '✓' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedAsset?._resolvedUrl && (
                    <div className="flex items-start gap-3 p-2 rounded-lg border border-border/50 bg-muted/20">
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-border/50 shrink-0">
                        <img
                          src={selectedAsset._resolvedUrl}
                          alt={selectedAsset.title || 'Asset'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0 py-0.5">
                        <p className="text-xs font-medium truncate">{selectedAsset.title || 'Untitled asset'}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{selectedAsset.asset_type}</p>
                        {selectedAsset.created_at && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Created {format(new Date(selectedAsset.created_at), 'MMM d')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedAssetId && !selectedAsset?._resolvedUrl && (
                    <p className="text-[10px] text-muted-foreground">Asset selected (preview unavailable)</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>No approved assets yet. Approve assets in Production first.</span>
                </div>
              )}
            </div>
          )}

          {/* 4. Caption from Campaign Pack */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                {isEmail ? 'Email Content' : isSms ? 'Message' : 'Caption'}
                <span className="font-normal text-muted-foreground ml-1">from Campaign Pack</span>
              </Label>
            </div>

            {/* Output switcher */}
            {eligibleOutputs.length > 1 && (
              <Select value={selectedOutputId} onValueChange={handleOutputChange}>
                <SelectTrigger className="h-8 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-accent shrink-0" />
                    <SelectValue placeholder="Switch copy source" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {eligibleOutputs.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      <span className="flex items-center gap-1.5">
                        {OUTPUT_TYPE_LABELS[o.output_type] || o.output_type}
                        {o.status === 'approved' && <Check className="w-3 h-3 text-success" />}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedOutputId && (
              <Badge variant="outline" className="text-[10px] gap-1">
                Source: {OUTPUT_TYPE_LABELS[approvedOutputs.find((o: any) => o.id === selectedOutputId)?.output_type || ''] || 'Copy output'}
              </Badge>
            )}

            <Textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={isEmail ? 6 : 4}
              placeholder={
                isEmail
                  ? 'Email subject and body...'
                  : isSms
                  ? 'SMS message...'
                  : 'Post caption...'
              }
              className="text-sm"
            />
            {caption && (
              <p className="text-[10px] text-muted-foreground text-right">{caption.length} characters</p>
            )}
          </div>

          {/* 5. Schedule */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Publish Date & Time <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={publishDate}
                onChange={e => setPublishDate(e.target.value)}
                className="h-9 text-sm"
              />
              <Input
                type="time"
                value={publishTime}
                onChange={e => setPublishTime(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* 6. Reminder */}
          {publishDate && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-accent" />
                <div>
                  <p className="text-xs font-medium">Publish Reminder</p>
                  <p className="text-[10px] text-muted-foreground">
                    Get reminded {reminderMinutesBefore} min before posting
                  </p>
                </div>
              </div>
              <Switch
                checked={reminderEnabled}
                onCheckedChange={setReminderEnabled}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || (!caption && !selectedAssetId)}>
            {saving ? 'Saving...' : editItem ? 'Update Pack' : 'Create Post Pack'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
