import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  ExternalLink,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Megaphone,
  Image,
  Film,
  Mail,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaImage } from '@/components/ui/media-image';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  TodayAction,
  DueState,
  DUE_STATE_CONFIG,
  getChannelLabel,
} from '@/hooks/use-todays-actions';

const CHANNEL_ICONS: Record<string, any> = {
  instagram_feed: Image,
  instagram_stories: Image,
  instagram_reels: Film,
  tiktok: Film,
  email: Mail,
  sms: MessageSquare,
};

function formatReminderTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

interface TodaysActionsPanelProps {
  actions: TodayAction[];
  loading: boolean;
  onMarkPosted: (id: string) => Promise<void>;
}

export function TodaysActionsPanel({ actions, loading, onMarkPosted }: TodaysActionsPanelProps) {
  const { toast } = useToast();
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

  const handleCopyCaption = async (caption: string | null) => {
    if (!caption) {
      toast({ title: 'No caption available' });
      return;
    }
    await navigator.clipboard.writeText(caption);
    toast({ title: 'Caption copied to clipboard' });
  };

  const handleMarkPosted = async (id: string) => {
    setMarkingIds((prev) => new Set(prev).add(id));
    try {
      await onMarkPosted(id);
      toast({ title: 'Marked as posted ✓' });
    } finally {
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDownload = (url: string | null) => {
    if (!url) {
      toast({ title: 'No asset available to download' });
      return;
    }
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Today's Actions
        </h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (!actions.length) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Today's Actions
        </h2>
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 p-6">
            <CheckCircle2 className="w-8 h-8 text-accent shrink-0" />
            <div>
              <p className="font-medium text-sm">Nothing due right now</p>
              <p className="text-xs text-muted-foreground">
                Schedule posts with reminders in your campaigns and they'll appear here when it's time to post.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  const DUE_BORDER: Record<DueState, string> = {
    overdue: 'border-l-destructive',
    due_now: 'border-l-warning',
    due_soon: 'border-l-accent',
    upcoming: 'border-l-muted-foreground',
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Today's Actions
        </h2>
        <Badge variant="outline" className="text-xs">
          {actions.length} pending
        </Badge>
      </div>
      <div className="space-y-2">
        <AnimatePresence>
          {actions.map((action) => {
            const ChannelIcon = CHANNEL_ICONS[action.channel] || Image;
            const dueConfig = DUE_STATE_CONFIG[action.due_state];
            const isMarking = markingIds.has(action.id);

            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                layout
              >
                <Card className={`border-l-4 ${DUE_BORDER[action.due_state]} hover:border-accent/40 transition-colors`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <MediaImage
                        src={action.media_url}
                        fallbackIcon={<ChannelIcon className="w-5 h-5 text-muted-foreground" />}
                        aspectClassName=""
                        containerClassName="w-12 h-12 rounded-lg shrink-0"
                      />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-medium truncate">{action.title}</p>
                          <Badge variant="outline" className={`text-[10px] ${dueConfig.color}`}>
                            {dueConfig.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                          <span>{getChannelLabel(action.channel)}</span>
                          <span>·</span>
                          <Clock className="w-3 h-3" />
                          <span>{formatReminderTime(action.reminder_at)}</span>
                        </div>
                        {action.plan_title && (
                          <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                            <Megaphone className="w-3 h-3" />
                            From Campaign: {action.plan_title}
                          </p>
                        )}
                        {action.caption && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{action.caption}</p>
                        )}

                        {/* Quick Actions */}
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs gap-1"
                            disabled={isMarking}
                            onClick={() => handleMarkPosted(action.id)}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {isMarking ? 'Posting…' : 'Mark Posted'}
                          </Button>
                          {action.caption && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleCopyCaption(action.caption)}
                            >
                              <Copy className="w-3 h-3" />
                              Copy Caption
                            </Button>
                          )}
                          {action.media_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleDownload(action.media_url)}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          )}
                          {action.plan_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-muted-foreground"
                              asChild
                            >
                              <Link to={`/content/planner/plan/${action.plan_id}`}>
                                <ExternalLink className="w-3 h-3" />
                                Open Campaign
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
