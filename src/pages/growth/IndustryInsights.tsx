import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Lightbulb, TrendingUp, Clock, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function IndustryInsights() {
  const { currentVenue } = useVenue();

  const { data: insights, isLoading } = useQuery({
    queryKey: ['venue-insights', currentVenue?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_insights')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentVenue,
  });

  const typeIcons: Record<string, typeof Lightbulb> = {
    posting_time: Clock,
    content_format: BarChart3,
    trend: TrendingUp,
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <PageHeader
        title="Industry Insights"
        description="Anonymised intelligence from the hospitality network to guide your strategy."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : !insights?.length ? (
        <EmptyState
          icon={Lightbulb}
          title="No insights available yet"
          description="As the network grows, anonymised benchmarks and recommendations will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight) => {
            const d = insight.insight_data as Record<string, any> | null;
            const title = d?.title || d?.headline || insight.insight_type;
            const summary = d?.summary || d?.description || '';
            const Icon = typeIcons[insight.insight_type] || Lightbulb;

            return (
              <Card key={insight.id} className="card-elevated card-hover">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-info" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{title}</p>
                      {insight.confidence_score > 0.7 && (
                        <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/20">
                          High confidence
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3">{summary}</p>
                    <div className="flex items-center gap-2 pt-1">
                      {insight.cuisine_category && (
                        <Badge variant="secondary" className="text-[10px]">{insight.cuisine_category}</Badge>
                      )}
                      {insight.city && (
                        <Badge variant="secondary" className="text-[10px]">{insight.city}</Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground/60 ml-auto">
                        {new Date(insight.generated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
