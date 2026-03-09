import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function IndustryInsight() {
  const { currentVenue } = useVenue();

  const { data: insight, isLoading } = useQuery({
    queryKey: ['industry-insight', currentVenue?.id],
    queryFn: async () => {
      if (!currentVenue) return null;

      // Get the most relevant insight for this venue's city/cuisine
      const { data, error } = await supabase
        .from('venue_insights')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!currentVenue,
  });

  if (isLoading) {
    return <Skeleton className="h-24 rounded-lg" />;
  }

  if (!insight) return null;

  const insightData = insight.insight_data as Record<string, any> | null;
  const title = insightData?.title || insightData?.headline || 'Industry Insight';
  const summary = insightData?.summary || insightData?.description || '';
  const confidence = insight.confidence_score;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Industry Insight
        </h2>
        <Link to="/growth/insights">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            View All <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>
      <Card className="bg-gradient-to-r from-info/5 to-transparent border-info/20">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
            <Lightbulb className="w-4.5 h-4.5 text-info" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium">{title}</p>
              {confidence > 0.7 && (
                <Badge variant="outline" className="text-[10px] bg-info/10 text-info border-info/20">
                  High confidence
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{summary}</p>
            {insight.cuisine_category && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {insight.cuisine_category} · {insight.city || 'All regions'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
