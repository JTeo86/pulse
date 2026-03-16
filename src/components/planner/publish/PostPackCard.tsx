import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Copy, Check, ExternalLink, Download, Clock, CheckCircle2,
  Archive, Pencil, Trash2, Bell, Image as ImageIcon, Video,
  Mail, MessageSquare, Instagram, Play,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlanPublishItem, PACK_STATUS_CONFIG, PUBLISH_CHANNELS } from '@/hooks/use-plan-publish';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface PostPackCardProps {
  item: PlanPublishItem;
  assetData: any;
  onEdit: () => void;
  onMarkPosted: () => void;
  onArchive: () => void;
  onRemove: () => void;
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  instagram_feed: Instagram,
  instagram_stories: Play,
  instagram_reels: Video,
  tiktok: Video,
  email: Mail,
  sms: MessageSquare,
};

const CHANNEL_COLORS: Record<string, string> = {
  instagram_feed: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  instagram_stories: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  instagram_reels: 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20',
  tiktok: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  email: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  sms: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
};

export function PostPackCard({
  item,
  assetData,
  onEdit,
  onMarkPosted,
  onArchive,
  onRemove,
}: PostPackCardProps) {
  const { toast } = useToast();
  const [captionCopied, setCaptionCopied] = useState(false);

  const channel = PUBLISH_CHANNELS.find(c => c.value === item.channel);
  const channelLabel = channel?.label || item.channel;
  const ChannelIcon = CHANNEL_ICONS[item.channel] || ImageIcon;
  const statusConfig = PACK_STATUS_CONFIG[item.status] || PACK_STATUS_CONFIG.draft;
  const channelColor = CHANNEL_COLORS[item.channel] || 'bg-muted text-muted-foreground border-border';

  const isEmail = item.channel === 'email';
  const isSms = item.channel === 'sms';
  const isPosted = item.status === 'published';

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(item.caption || '');
    setCaptionCopied(true);
    toast({ title: isEmail ? 'Email copied' : isSms ? 'Message copied' : 'Caption copied' });
    setTimeout(() => setCaptionCopied(false), 2000);
  };

  const handleDownloadAsset = async () => {
    if (!assetData?._resolvedUrl) return;
    try {
      const response = await fetch(assetData._resolvedUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = assetData.title || `asset-${item.channel}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Download started' });
    } catch {
      toast({ variant: 'destructive', title: 'Download failed' });
    }
  };

  const handleOpenAsset = () => {
    if (assetData?._resolvedUrl) {
      window.open(assetData._resolvedUrl, '_blank');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border bg-card overflow-hidden ${isPosted ? 'opacity-75' : ''}`}
    >
      {/* Channel header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${channelColor}`}>
        <ChannelIcon className="w-4 h-4" />
        <span className="text-xs font-semibold tracking-wide uppercase">{channelLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          {item.reminder_at && (
            <Badge variant="outline" className="text-[10px] gap-1 border-0">
              <Bell className="w-3 h-3" />
              {format(new Date(item.reminder_at), 'MMM d, h:mm a')}
            </Badge>
          )}
          <Badge className={`text-[10px] border-0 ${statusConfig.color}`}>
            {statusConfig.label}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Title */}
        {item.title && (
          <p className="text-sm font-medium text-foreground">{item.title}</p>
        )}

        {/* Asset preview */}
        <div className="flex gap-3">
          {assetData?._resolvedUrl ? (
            <div className="w-20 h-20 rounded-lg overflow-hidden border border-border/50 shrink-0">
              {assetData.asset_type === 'reel' || assetData.asset_type === 'video' ? (
                <div className="w-full h-full bg-muted flex items-center justify-center relative">
                  <img src={assetData._resolvedUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="w-6 h-6 text-white" />
                  </div>
                </div>
              ) : (
                <img src={assetData._resolvedUrl} alt="" className="w-full h-full object-cover" />
              )}
            </div>
          ) : (
            !isEmail && !isSms && (
              <div className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center shrink-0 bg-muted/30">
                <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
              </div>
            )
          )}

          {/* Caption preview */}
          <div className="flex-1 min-w-0">
            {item.caption ? (
              <p className="text-sm text-foreground/80 line-clamp-4 whitespace-pre-wrap leading-relaxed">
                {item.caption}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No caption set</p>
            )}
          </div>
        </div>

        {/* Schedule info */}
        {item.publish_date && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>
              {item.status === 'published' ? 'Posted' : 'Scheduled'}:{' '}
              {format(new Date(item.publish_date), 'EEEE, MMM d · h:mm a')}
            </span>
          </div>
        )}
        {item.posted_at && (
          <div className="flex items-center gap-2 text-xs text-success">
            <CheckCircle2 className="w-3 h-3" />
            <span>Posted: {format(new Date(item.posted_at), 'MMM d, h:mm a')}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {item.caption && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={handleCopyCaption}
            >
              {captionCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {captionCopied
                ? 'Copied!'
                : isEmail
                ? 'Copy Email'
                : isSms
                ? 'Copy Message'
                : 'Copy Caption'}
            </Button>
          )}

          {assetData?._resolvedUrl && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleOpenAsset}>
                <ExternalLink className="w-3 h-3" /> Open
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleDownloadAsset}>
                <Download className="w-3 h-3" /> Download
              </Button>
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            {!isPosted && (
              <>
                <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={onEdit}>
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={onMarkPosted}
                >
                  <CheckCircle2 className="w-3 h-3" /> Mark Posted
                </Button>
              </>
            )}
            {isPosted && (
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-muted-foreground" onClick={onArchive}>
                <Archive className="w-3 h-3" /> Archive
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive/60 hover:text-destructive" onClick={onRemove}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
