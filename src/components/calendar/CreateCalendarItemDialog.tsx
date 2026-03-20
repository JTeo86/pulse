import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useToast } from '@/hooks/use-toast';
import { normalizeContentAssetType } from '@/lib/content-item-utils';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarMediaPicker, type SelectedMedia } from './CalendarMediaPicker';

const CHANNELS = [
  { value: 'instagram_feed', label: 'Instagram Feed' },
  { value: 'instagram_stories', label: 'Instagram Stories' },
  { value: 'instagram_reels', label: 'Instagram Reels' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS / Push' },
] as const;

const INTENTS = [
  { value: 'standard', label: 'Standard' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'event', label: 'Event' },
  { value: 'menu_update', label: 'Menu Update' },
  { value: 'seasonal', label: 'Seasonal' },
] as const;

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
] as const;

interface CreateCalendarItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateCalendarItemDialog({
  open, onOpenChange, onCreated,
}: CreateCalendarItemDialogProps) {
  const { currentVenue } = useVenue();
  const { toast } = useToast();

  const [caption, setCaption] = useState('');
  const [channel, setChannel] = useState('instagram_feed');
  const [intent, setIntent] = useState('standard');
  const [status, setStatus] = useState('scheduled');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [scheduledTime, setScheduledTime] = useState('12:00');
  const [media, setMedia] = useState<SelectedMedia | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCaption('');
    setChannel('instagram_feed');
    setIntent('standard');
    setStatus('scheduled');
    setScheduledDate(undefined);
    setScheduledTime('12:00');
    setMedia(null);
  };

  const handleCreate = async () => {
    if (!currentVenue) return;

    if (status === 'scheduled' && !scheduledDate) {
      toast({ variant: 'destructive', title: 'Please choose a scheduled date' });
      return;
    }

    setSaving(true);

    let scheduledFor: string | null = null;
    if (scheduledDate) {
      const [hours, minutes] = scheduledTime.split(':').map(Number);
      const dt = new Date(scheduledDate);
      dt.setHours(hours, minutes, 0, 0);
      scheduledFor = dt.toISOString();
    }

    // Resolve the media URL to persist
    let mediaUrl: string | null = null;
    if (media) {
      if (media.storagePath) {
        // For freshly uploaded files, generate a long-lived signed URL
        const { data: signed } = await supabase.storage
          .from('venue-assets')
          .createSignedUrl(media.storagePath, 60 * 60 * 24 * 365);
        mediaUrl = signed?.signedUrl || media.url;
      } else {
        mediaUrl = media.url;
      }
    }

    // Derive a valid asset_type from the selected media
    const assetType = media
      ? normalizeContentAssetType(media.type, null, media.label)
      : null;

    const { error } = await supabase.from('content_items').insert({
      venue_id: currentVenue.id,
      caption_draft: caption || null,
      caption_final: caption || null,
      status,
      intent,
      scheduled_for: scheduledFor,
      media_master_url: mediaUrl,
      asset_type: assetType,
    });

    setSaving(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to create', description: error.message });
      return;
    }

    toast({ title: 'Calendar item created' });
    resetForm();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Calendar Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Caption */}
          <div className="space-y-1.5">
            <Label htmlFor="create-caption">Caption</Label>
            <Textarea
              id="create-caption"
              placeholder="Write your caption…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {/* Channel + Intent row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={intent} onValueChange={setIntent}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTENTS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule date + time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !scheduledDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={setScheduledDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-time">Time</Label>
              <Input
                id="create-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          {/* Media picker */}
          <CalendarMediaPicker value={media} onChange={setMedia} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
