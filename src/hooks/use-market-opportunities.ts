import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import {
  buildContentSuggestions,
  buildReviewToContentSuggestions,
  generateMarketOpportunities,
} from '@/lib/market-opportunities';

export function useMarketOpportunities(limit = 5) {
  const { currentVenue } = useVenue();

  const { data, isLoading } = useQuery({
    queryKey: ['market-opportunity-signals', currentVenue?.id],
    enabled: !!currentVenue,
    queryFn: async () => {
      if (!currentVenue) return null;

      const [scheduledContent, recentReviews] = await Promise.all([
        supabase
          .from('content_items')
          .select('scheduled_for')
          .eq('venue_id', currentVenue.id)
          .not('scheduled_for', 'is', null)
          .order('scheduled_for', { ascending: true })
          .limit(120),
        supabase
          .from('review_response_tasks')
          .select('review_text, rating')
          .eq('venue_id', currentVenue.id)
          .order('created_at', { ascending: false })
          .limit(120),
      ]);

      return {
        scheduledDates: (scheduledContent.data ?? [])
          .map((row) => row.scheduled_for)
          .filter((value): value is string => Boolean(value)),
        recentReviews: recentReviews.data ?? [],
      };
    },
  });

  const opportunities = useMemo(() => {
    if (!data) return [];
    return generateMarketOpportunities(data).slice(0, limit);
  }, [data, limit]);

  const contentSuggestions = useMemo(() => buildContentSuggestions(opportunities), [opportunities]);
  const reviewContentSuggestions = useMemo(() => buildReviewToContentSuggestions(opportunities), [opportunities]);

  return {
    opportunities,
    contentSuggestions,
    reviewContentSuggestions,
    isLoading,
  };
}
