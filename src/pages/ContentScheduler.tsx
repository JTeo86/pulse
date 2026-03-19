import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Image } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/hooks/use-toast';
import { CalendarContentCard } from '@/components/calendar/CalendarContentCard';

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
