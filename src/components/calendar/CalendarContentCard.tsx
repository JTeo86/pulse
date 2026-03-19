import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Copy, Check, ExternalLink, Download, MoreVertical, Megaphone,
  Trash2, Image, Clock, Play,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ScheduledItem {
  id: string;
  caption_final: string | null;
  caption_draft: string | null;
  media_master_url: string | null;
  scheduled_for: string | null;
  status: string | null;
  intent: string | null;
  created_at: string;
  source_plan_publish_item_id: string | null;
  source_plan_title: string | null;
}

interface CalendarContentCardProps {
  item: ScheduledItem;
  onDelete: () => void;
}

export function CalendarContentCard({ item, onDelete }: CalendarContentCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [captionCopied, setCaptionCopied] = useState(false);

  const caption = item.caption_final || item.caption_draft || '';
  const hasCaption = caption.length > 0;
  const isCampaignLinked = !!item.source_plan_publish_item_id || !!item.source_plan_title;
  const hasMedia = !!item.media_master_url;

  const handleCopyCaption = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!hasCaption) return;
    navigator.clipboard.writeText(caption);
    setCaptionCopied(true);
    toast({ title: 'Caption copied' });
    setTimeout(() => setCaptionCopied(false), 2000);
  };

  const handleOpenAsset = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (item.media_master_url) {
      window.open(item.media_master_url, '_blank');
    }
  };

  const handleDownloadAsset = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!item.media_master_url) return;
    try {
      const response = await fetch(item.media_master_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `content-${item.id.slice(0, 8)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Download started' });
    } catch {
      toast({ variant: 'destructive', title: 'Download failed' });
    }
  };

  const handleOpenCampaign = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Navigate to planner - the source_plan_publish_item_id links to the plan
    navigate('/planner');
  };

  return (
    <Card className="overflow-hidden group">
      {/* Thumbnail area */}
      <div className="aspect-square bg-muted relative">
        {hasMedia ? (
          <img
            src={item.media_master_url!}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}

        {/* Hover overlay with quick actions */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          {hasCaption && (
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={handleCopyCaption}
              title="Copy caption"
            >
              {captionCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          )}
          {hasMedia && (
            <>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8"
                onClick={handleOpenAsset}
                title="Open asset"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8"
                onClick={handleDownloadAsset}
                title="Download asset"
              >
                <Download className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        {/* Menu */}
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasCaption && (
                <DropdownMenuItem
                  className="gap-2"
                  onClick={(e) => { e.stopPropagation(); handleCopyCaption(); }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Caption
                </DropdownMenuItem>
              )}
              {hasMedia && (
                <>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={handleOpenAsset}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Asset
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={handleDownloadAsset}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Asset
                  </DropdownMenuItem>
                </>
              )}
              {isCampaignLinked && (
                <DropdownMenuItem
                  className="gap-2"
                  onClick={handleOpenCampaign}
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  Open Campaign
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive gap-2"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CardContent className="p-3 space-y-1.5">
        {/* Status + schedule */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={item.status === 'published' ? 'default' : item.status === 'scheduled' ? 'default' : 'secondary'}
          >
            {item.status}
          </Badge>
          {item.scheduled_for && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(item.scheduled_for), 'MMM d, h:mm a')}
            </span>
          )}
        </div>

        {/* Campaign source label */}
        {isCampaignLinked ? (
          <button
            onClick={handleOpenCampaign}
            className="flex items-center gap-1.5 hover:underline"
          >
            <Megaphone className="w-3 h-3 text-accent shrink-0" />
            <span className="text-[10px] font-medium text-accent truncate">
              From Campaign{item.source_plan_title ? `: ${item.source_plan_title}` : ''}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">One-off Post</span>
          </div>
        )}

        {/* Caption preview */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {hasCaption ? caption : 'No caption'}
        </p>
      </CardContent>
    </Card>
  );
}
