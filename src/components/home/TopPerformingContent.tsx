import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { ArrowRight, Image, Film, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TopPerformingContent() {
  const { currentVenue } = useVenue();

  const { data: content, isLoading } = useQuery({
    queryKey: ['top-content', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return [];

      // Get recently created content items with revenue signals
      const { data: items, error } = await supabase
        .from('content_items')
        .select('id, caption_final, asset_type, status, scheduled_for, media_master_url, created_at')
        .eq('venue_id', currentVenue.id)
        .in('status', ['published', 'scheduled'])
        .order('created_at', { ascending: false })
        .limit(4);

      if (error) throw error;

      // Get revenue signals for these content items
      const ids = (items ?? []).map((i) => i.id);
      let signals: any[] = [];
      if (ids.length > 0) {
        const { data: sigs } = await supabase
          .from('revenue_signals')
          .select('source_id, revenue_estimate, engagement_metrics')
          .eq('venue_id', currentVenue.id)
          .eq('source_type', 'post')
          .in('source_id', ids);
        signals = sigs ?? [];
      }

      const signalMap = new Map(signals.map((s) => [s.source_id, s]));

      return (items ?? []).map((item) => {
        const sig = signalMap.get(item.id);
        return {
          ...item,
          revenue: sig ? Number(sig.revenue_estimate) || 0 : 0,
          engagement: sig?.engagement_metrics || {},
        };
      });
    },
    enabled: !!currentVenue,
  });

  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Top Performing Content
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (!content?.length) {
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Top Performing Content
          </h2>
          <Link to="/studio">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
              Create Content <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <p className="text-sm">Create content in Studio to see performance data here.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Top Performing Content
        </h2>
        <Link to="/growth/performance">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            View All <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {content.map((item) => (
          <Card key={item.id} className="group overflow-hidden hover:border-accent/30 transition-colors">
            <div className="aspect-[4/3] bg-muted relative overflow-hidden">
              {item.media_master_url ? (
                <img
                  src={item.media_master_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {item.asset_type === 'reel' ? (
                    <Film className="w-8 h-8 text-muted-foreground/40" />
                  ) : (
                    <Image className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </div>
              )}
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="text-[10px]">
                  {item.status}
                </Badge>
              </div>
            </div>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {item.caption_final || 'Untitled content'}
              </p>
              {item.revenue > 0 && (
                <div className="flex items-center gap-1 text-accent">
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-xs font-medium">
                    £{item.revenue.toLocaleString('en-GB')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
