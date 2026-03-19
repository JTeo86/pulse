import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Image } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { CalendarContentCard } from '@/components/calendar/CalendarContentCard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

export default function ContentScheduler() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchScheduled = useCallback(async () => {
    if (!currentVenue) return;
    setLoading(true);
    const { data } = await supabase
      .from('content_items')
      .select('id, caption_final, caption_draft, media_master_url, scheduled_for, status, intent, created_at, source_plan_publish_item_id, source_plan_title')
      .eq('venue_id', currentVenue.id)
      .in('status', ['scheduled', 'draft', 'published'])
      .order('scheduled_for', { ascending: true, nullsFirst: false });

    setItems((data as ScheduledItem[]) || []);
    setLoading(false);
  }, [currentVenue]);

  useEffect(() => { fetchScheduled(); }, [fetchScheduled]);

  const handleDelete = async (item: ScheduledItem) => {
    setItems(prev => prev.filter(i => i.id !== item.id));

    const { error } = await supabase
      .from('content_items')
      .delete()
      .eq('id', item.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Failed to delete', description: error.message });
      fetchScheduled();
      return;
    }

    if (item.source_plan_publish_item_id) {
      const { data: packData, error: packError } = await supabase
        .from('plan_publish_items')
        .select('metadata')
        .eq('id', item.source_plan_publish_item_id)
        .single();

      if (packError) {
        toast({ variant: 'destructive', title: 'Calendar item deleted, but pack sync failed', description: packError.message });
        return;
      }

      const meta = ((packData?.metadata as Record<string, any>) || {});
      delete meta.calendar_item_id;

      const { error: resetError } = await supabase
        .from('plan_publish_items')
        .update({ status: 'ready', metadata: meta } as any)
        .eq('id', item.source_plan_publish_item_id);

      if (resetError) {
        toast({ variant: 'destructive', title: 'Calendar item deleted, but pack sync failed', description: resetError.message });
        return;
      }
    }

    toast({ title: 'Removed from calendar' });
  };

  const scheduledItems = items.filter((i) => i.status === 'scheduled' && i.scheduled_for);
  const draftItems = items.filter((i) => i.status === 'draft');
  const publishedItems = items.filter((i) => i.status === 'published');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <PageHeader
        title="Content Calendar"
        description="Manage all scheduled and draft posts for your venue — including campaign posts and one-off content."
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No content on your calendar"
          description="Create content in the Studio or build Post Packs in the Planner to populate your calendar."
        />
      ) : (
        <div className="space-y-8">
          {scheduledItems.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent" />
                Scheduled ({scheduledItems.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {scheduledItems.map((item) => (
                  <CalendarContentCard key={item.id} item={item} onDelete={() => handleDelete(item)} />
                ))}
              </div>
            </section>
          )}

          {draftItems.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Image className="w-5 h-5 text-muted-foreground" />
                Drafts ({draftItems.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {draftItems.map((item) => (
                  <CalendarContentCard key={item.id} item={item} onDelete={() => handleDelete(item)} />
                ))}
              </div>
            </section>
          )}

          {publishedItems.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-success" />
                Published ({publishedItems.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {publishedItems.map((item) => (
                  <CalendarContentCard key={item.id} item={item} onDelete={() => handleDelete(item)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ContentCard({ item, onDelete }: { item: ScheduledItem; onDelete: () => void }) {
  const navigate = useNavigate();
  const caption = item.caption_final || item.caption_draft || 'No caption';
  const isCampaignLinked = !!item.source_plan_publish_item_id || !!item.source_plan_title;

  return (
    <Card className="overflow-hidden group">
      <div className="aspect-square bg-muted relative">
        {item.media_master_url ? (
          <img src={item.media_master_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
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

      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant={item.status === 'scheduled' ? 'default' : item.status === 'published' ? 'default' : 'secondary'}>
            {item.status}
          </Badge>
          {item.scheduled_for && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(item.scheduled_for), 'MMM d, h:mm a')}
            </span>
          )}
        </div>

        {isCampaignLinked ? (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Megaphone className="w-3 h-3 text-accent shrink-0" />
            <span className="text-[10px] font-medium text-accent truncate">
              From Campaign{item.source_plan_title ? `: ${item.source_plan_title}` : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">One-off Post</span>
          </div>
        )}

        <p className="text-sm text-muted-foreground line-clamp-2">{caption}</p>
      </CardContent>
    </Card>
  );
}
