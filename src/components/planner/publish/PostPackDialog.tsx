import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Bell, Sparkles, Image as ImageIcon } from 'lucide-react';
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
import { PUBLISH_CHANNELS, PlanPublishItem, CHANNEL_COPY_MAP } from '@/hooks/use-plan-publish';
import { SuggestedPostPack } from './post-pack-engine';

interface PostPackDialogProps {
  open: boolean;
  onClose: () => void;
  editItem: PlanPublishItem | null;
  suggestion: SuggestedPostPack | null;
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

export function PostPackDialog({
  open,
  onClose,
  editItem,
  suggestion,
  approvedAssets,
  assetData,
  approvedOutputs,
  onSave,
}: PostPackDialogProps) {
  const [channel, setChannel] = useState('instagram_feed');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [publishTime, setPublishTime] = useState('12:00');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedPlanAssetId, setSelectedPlanAssetId] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(30);
  const [saving, setSaving] = useState(false);

  // Reset / prefill form
  useEffect(() => {
    if (editItem) {
      setChannel(editItem.channel);
      setTitle(editItem.title || '');
      setCaption(editItem.caption || '');
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
    } else if (suggestion) {
      setChannel(suggestion.channel);
      setTitle(suggestion.title);
      setCaption(suggestion.suggestedCaption);
      setSelectedAssetId(suggestion.suggestedAssetId || '');
      setSelectedPlanAssetId(suggestion.suggestedPlanAssetId || '');
      setPublishDate('');
      setPublishTime('12:00');
      setReminderEnabled(false);
    } else {
      setChannel('instagram_feed');
      setTitle('');
      setCaption('');
      setPublishDate('');
      setPublishTime('12:00');
      setSelectedAssetId('');
      setSelectedPlanAssetId('');
      setReminderEnabled(false);
    }
  }, [editItem, suggestion, open]);

  // Auto-fill caption from channel match
  const handleAutofillCaption = () => {
    const copyTypes = CHANNEL_COPY_MAP[channel] || [];
    for (const copyType of copyTypes) {
      const match = approvedOutputs.find((o: any) => o.output_type === copyType);
      if (match) {
        setCaption(match.content);
        return;
      }
    }
    // Fallback
    if (approvedOutputs.length > 0) {
      setCaption(approvedOutputs[0].content);
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
        title: title || `${channelConfig?.label || channel} Post Pack`,
        caption,
        publish_date: publishDateIso,
        reminder_at: reminderAt,
        content_asset_id: selectedAssetId || undefined,
        plan_asset_id: selectedPlanAssetId || undefined,
        status: publishDateIso ? 'scheduled' : 'ready',
        metadata: {
          output_source_type: suggestion?.suggestedCaptionSource || null,
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

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? 'Edit Post Pack' : 'Create Post Pack'}</DialogTitle>
          <DialogDescription>
            {editItem
              ? 'Update this post pack before publishing.'
              : 'Pulse has pre-filled the best copy and asset for this channel.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Channel */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Channel</Label>
            <Select value={channel} onValueChange={c => {
              setChannel(c);
              const cfg = PUBLISH_CHANNELS.find(ch => ch.value === c);
              if (!title || title.includes('Post Pack')) {
                setTitle(`${cfg?.label || c} Post Pack`);
              }
            }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PUBLISH_CHANNELS.map(ch => (
                  <SelectItem key={ch.value} value={ch.value}>{ch.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Pack Title</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`${channelConfig?.label || ''} Post Pack`}
              className="h-9 text-sm"
            />
          </div>

          {/* Asset */}
          {!isEmail && !isSms && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Asset</Label>
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
                            {real?.title || pa.asset_type} {pa.status === 'approved' ? '✓' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedAssetId && assetData[selectedAssetId]?._resolvedUrl && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-border/50">
                      <img
                        src={assetData[selectedAssetId]._resolvedUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
                  <ImageIcon className="w-4 h-4" />
                  <span>No approved assets yet. Create assets in Production first.</span>
                </div>
              )}
            </div>
          )}

          {/* Caption */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                {isEmail ? 'Email Content' : isSms ? 'Message' : 'Caption'}
              </Label>
              {approvedOutputs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1 text-accent"
                  onClick={handleAutofillCaption}
                >
                  <Sparkles className="w-3 h-3" /> Auto-fill from copy
                </Button>
              )}
            </div>
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

          {/* Schedule */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Publish Date & Time</Label>
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

          {/* Reminder */}
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
