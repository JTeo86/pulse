import { useState } from 'react';
import { TrendingUp, Users, MinusCircle, CheckCircle2, Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';

type FeedbackOutcome = 'covers_up' | 'revenue_up' | 'no_noticeable_impact';

interface RevenueFeedback {
  id: string;
  plan_id: string;
  venue_id: string;
  feedback_outcome: FeedbackOutcome;
  notes: string | null;
  submitted_by: string | null;
  submitted_at: string;
}

const OUTCOME_OPTIONS: { value: FeedbackOutcome; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'covers_up', label: 'Covers up', icon: Users, description: 'More people came in' },
  { value: 'revenue_up', label: 'Revenue up', icon: TrendingUp, description: 'Spend increased' },
  { value: 'no_noticeable_impact', label: 'No noticeable impact', icon: MinusCircle, description: 'No change noticed' },
];

const OUTCOME_LABELS: Record<FeedbackOutcome, string> = {
  covers_up: 'Covers up',
  revenue_up: 'Revenue up',
  no_noticeable_impact: 'No noticeable impact',
};

const OUTCOME_COLORS: Record<FeedbackOutcome, string> = {
  covers_up: 'bg-info/15 text-info border-info/20',
  revenue_up: 'bg-success/15 text-success border-success/20',
  no_noticeable_impact: 'bg-muted text-muted-foreground border-border',
};

interface RevenueFeedbackCardProps {
  planId: string;
  plan: any;
  feedback: RevenueFeedback | null;
  onFeedbackSubmitted: () => void;
  hasPostedPacks: boolean;
}

export function RevenueFeedbackCard({ planId, plan, feedback, onFeedbackSubmitted, hasPostedPacks }: RevenueFeedbackCardProps) {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<FeedbackOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Already submitted — show result
  if (feedback) {
    return (
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <h3 className="font-medium text-sm">Campaign Feedback</h3>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`${OUTCOME_COLORS[feedback.feedback_outcome]} text-xs px-3 py-1`}>
            {OUTCOME_LABELS[feedback.feedback_outcome]}
          </Badge>
          {feedback.notes && (
            <p className="text-xs text-muted-foreground italic">"{feedback.notes}"</p>
          )}
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-accent/5 border border-accent/15 p-3">
          <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Lily has recorded this result and will use it to improve future campaign recommendations for {currentVenue?.name || 'your venue'}.
          </p>
        </div>
      </div>
    );
  }

  // Not yet posted — don't show
  if (!hasPostedPacks) return null;

  const handleSubmit = async () => {
    if (!selected || !currentVenue) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('plan_revenue_feedback' as any).insert({
        plan_id: planId,
        venue_id: currentVenue.id,
        feedback_outcome: selected,
        notes: notes.trim() || null,
        submitted_by: user?.id || null,
      } as any);

      if (error) throw error;

      // Emit learning signal
      const decision = plan?.decision || {};
      await supabase.from('venue_learning_signals' as any).insert({
        venue_id: currentVenue.id,
        signal_type: `campaign_${selected}`,
        category: decision.campaign_angle || decision.run_offer ? 'offer' : 'general',
        channel: null,
        confidence_score: 0.6,
        supporting_count: 1,
        payload: {
          plan_id: planId,
          plan_title: plan?.title,
          feedback_outcome: selected,
          campaign_angle: decision.campaign_angle || null,
          target_audience: decision.target_audience || null,
          has_offer: !!decision.run_offer,
          offer_terms: decision.offer_terms || null,
        },
      } as any);

      toast({ title: 'Feedback recorded', description: 'Lily will learn from this result.' });
      onFeedbackSubmitted();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card-elevated p-5 space-y-4">
      <div>
        <h3 className="font-medium text-sm">How did this campaign perform?</h3>
        <p className="text-xs text-muted-foreground mt-0.5">One tap helps Lily learn what works for your venue.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {OUTCOME_OPTIONS.map(opt => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border transition-all text-center ${
                isSelected
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                  : 'border-border hover:border-accent/30 hover:bg-muted/30'
              }`}
            >
              <opt.icon className={`w-5 h-5 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} />
              <span className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                {opt.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{opt.description}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="space-y-3">
          {showNotes ? (
            <Textarea
              placeholder="Optional: any quick notes about this campaign..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          ) : (
            <button
              onClick={() => setShowNotes(true)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <MessageSquare className="w-3 h-3" /> Add a note (optional)
            </button>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
              {submitting ? 'Saving...' : 'Submit Feedback'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelected(null); setShowNotes(false); setNotes(''); }}>
              Skip for now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
