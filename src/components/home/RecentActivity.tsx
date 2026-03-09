import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Image, Clock } from 'lucide-react';

export function RecentActivity() {
  const { currentVenue } = useVenue();

  const { data: activity, isLoading } = useQuery({
    queryKey: ['recent-activity', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];

      const { data, error } = await supabase
        .from('edited_assets')
        .select('id, created_at')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      return (data ?? []).map((edit) => ({
        id: edit.id,
        title: 'Pro Photo generated',
        timestamp: edit.created_at,
      }));
    },
    enabled: !!currentVenue,
  });

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recent Activity
        </h2>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Recent Activity
      </h2>

      {!activity?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <p className="text-sm">No recent activity yet. Start creating content!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activity.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border"
            >
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                <Image className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{formatTimeAgo(item.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
