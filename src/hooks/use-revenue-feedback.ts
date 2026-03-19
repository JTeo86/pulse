import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RevenueFeedback {
  id: string;
  plan_id: string;
  venue_id: string;
  feedback_outcome: 'covers_up' | 'revenue_up' | 'no_noticeable_impact';
  notes: string | null;
  submitted_by: string | null;
  submitted_at: string;
}

export interface LearningSignalSummary {
  positive_revenue_count: number;
  positive_covers_count: number;
  neutral_count: number;
  top_patterns: string[];
}

export function useRevenueFeedback(planId?: string) {
  const [feedback, setFeedback] = useState<RevenueFeedback | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFeedback = useCallback(async () => {
    if (!planId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('plan_revenue_feedback' as any)
      .select('*')
      .eq('plan_id', planId)
      .maybeSingle();
    setFeedback(data as any);
    setLoading(false);
  }, [planId]);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);

  return { feedback, loading, refetch: fetchFeedback };
}

export function useVenueLearningSignals(venueId?: string) {
  const [summary, setSummary] = useState<LearningSignalSummary>({
    positive_revenue_count: 0,
    positive_covers_count: 0,
    neutral_count: 0,
    top_patterns: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!venueId) { setLoading(false); return; }

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('venue_learning_signals' as any)
        .select('signal_type, category, confidence_score, supporting_count, payload')
        .eq('venue_id', venueId)
        .order('last_reinforced_at', { ascending: false })
        .limit(50);

      const signals = (data || []) as any[];
      const revenueUp = signals.filter(s => s.signal_type === 'campaign_revenue_up');
      const coversUp = signals.filter(s => s.signal_type === 'campaign_covers_up');
      const neutral = signals.filter(s => s.signal_type === 'campaign_no_noticeable_impact');

      // Extract top patterns
      const patterns: string[] = [];
      const angleCounts: Record<string, { outcome: string; count: number }> = {};
      for (const s of signals) {
        const angle = s.payload?.campaign_angle;
        if (angle && s.signal_type !== 'campaign_no_noticeable_impact') {
          if (!angleCounts[angle]) angleCounts[angle] = { outcome: s.signal_type, count: 0 };
          angleCounts[angle].count += s.supporting_count || 1;
        }
      }
      for (const [angle, info] of Object.entries(angleCounts)) {
        if (info.count >= 2) {
          const verb = info.outcome === 'campaign_revenue_up' ? 'drive revenue' : 'increase covers';
          patterns.push(`${angle} campaigns tend to ${verb}`);
        }
      }

      setSummary({
        positive_revenue_count: revenueUp.reduce((s, r) => s + (r.supporting_count || 1), 0),
        positive_covers_count: coversUp.reduce((s, r) => s + (r.supporting_count || 1), 0),
        neutral_count: neutral.reduce((s, r) => s + (r.supporting_count || 1), 0),
        top_patterns: patterns.slice(0, 5),
      });
      setLoading(false);
    })();
  }, [venueId]);

  return { summary, loading };
}
