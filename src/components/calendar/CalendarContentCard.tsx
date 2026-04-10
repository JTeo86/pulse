import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Copy, Check, ExternalLink, Download, MoreVertical, Megaphone,
  Trash2, Clock, Play,
} from 'lucide-react';
import { MediaImage } from '@/components/ui/media-image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { generateExplanation } from '@/lib/explanations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ScheduledItem {
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
  /** Resolved from join with plan_publish_items */
  source_plan_id: string | null;
}

interface CalendarContentCardProps {
  item: ScheduledItem;
  onDelete: () => void;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
}

export function CalendarContentCard({
  item,
  onDelete,
  selected = false,
  onSelectChange,
}: CalendarContentCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [captionCopied, setCaptionCopied] = useState(false);

  const caption = item.caption_final || item.caption_draft || '';
  const hasCaption = caption.length > 0;
  const isCampaignLinked = !!item.source_plan_publish_item_id || !!item.source_plan_title;
  const hasMedia = !!item.media_master_url;
  const [showWhy, setShowWhy] = useState(false);

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
    if (item.source_plan_id) {
      navigate(`/content/planner/plan/${item.source_plan_id}`);
    } else {
      // Fallback: go to plans view on Home
      navigate('/home?tab=plans');
    }
  };

  return (
    <Card className={`overflow-hidden group ${selected ? 'ring-2 ring-accent' : ''}`}>
      {/* Thumbnail area */}
      <MediaImage
        src={item.media_master_url}
        alt=""
        containerClassName="relative"
        aspectClassName="aspect-square"
      >
        {/* Selection checkbox */}
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelectChange?.(!!checked)}
            className="bg-background/80 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

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
                  <DropdownMenuItem className="gap-2" onClick={handleOpenAsset}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Asset
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={handleDownloadAsset}>
                    <Download className="w-3.5 h-3.5" />
                    Download Asset
                  </DropdownMenuItem>
                </>
              )}
              {isCampaignLinked && (
                <DropdownMenuItem className="gap-2" onClick={handleOpenCampaign}>
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
      </MediaImage>

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

        <Collapsible open={showWhy} onOpenChange={setShowWhy} className="rounded-md bg-muted/30 px-2 py-1.5">
          <CollapsibleTrigger className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground">
            Why this post exists
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              {generateExplanation({
                content_gap: ['3-day content'],
                timing: {
                  day_of_week: item.scheduled_for
                    ? new Date(item.scheduled_for).toLocaleDateString('en-US', { weekday: 'long' })
                    : 'this week',
                  event: item.source_plan_title || undefined,
                },
                asset_usage: { reuse_frequency: isCampaignLinked ? 'balanced' : 'low' },
              }).map((point) => (
                <li key={point} className="text-xs text-muted-foreground">{point}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
