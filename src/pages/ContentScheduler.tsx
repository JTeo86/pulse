import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, Plus, Image, MoreVertical, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { format } from 'date-fns';
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
  created_at: string;
}

export default function ContentScheduler() {
  const { currentVenue } = useVenue();
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentVenue) return;

    const fetchScheduled = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('content_items')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .in('status', ['scheduled', 'draft'])
        .order('scheduled_for', { ascending: true, nullsFirst: false });
      
      setItems((data as ScheduledItem[]) || []);
      setLoading(false);
    };

    fetchScheduled();
  }, [currentVenue]);

  const scheduledItems = items.filter((i) => i.status === 'scheduled' && i.scheduled_for);
  const draftItems = items.filter((i) => i.status === 'draft');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <PageHeader
        title="Content Scheduler"
        description="Plan and schedule your social content. See what's coming up and manage your queue."
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No scheduled content"
          description="Create content in the Studio and schedule it for publishing."
        />
      ) : (
        <div className="space-y-8">
          {/* Scheduled Section */}
          {scheduledItems.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent" />
                Scheduled ({scheduledItems.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {scheduledItems.map((item) => (
                  <ContentCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* Drafts Section */}
          {draftItems.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Image className="w-5 h-5 text-muted-foreground" />
                Drafts ({draftItems.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {draftItems.map((item) => (
                  <ContentCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ContentCard({ item }: { item: ScheduledItem }) {
  const caption = item.caption_final || item.caption_draft || 'No caption';

  return (
    <Card className="overflow-hidden group">
      {/* Image */}
      <div className="aspect-square bg-muted relative">
        {item.media_master_url ? (
          <img
            src={item.media_master_url}
            alt=""
            className="w-full h-full object-cover"
          />
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
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Reschedule</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={item.status === 'scheduled' ? 'default' : 'secondary'}>
            {item.status}
          </Badge>
          {item.scheduled_for && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(item.scheduled_for), 'MMM d, h:mm a')}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{caption}</p>
      </CardContent>
    </Card>
  );
}
