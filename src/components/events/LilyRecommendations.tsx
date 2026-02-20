import { useState } from 'react';
import { differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EventCatalogItem, VenueEventPlan } from '@/hooks/use-events';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_LEAD_TIME = 21;

type Urgency = 'start_now' | 'soon' | 'low_priority';

interface LilyEvent {
  event: EventCatalogItem;
  plan?: VenueEventPlan;
  daysUntil: number;
  urgency: Urgency;
}

interface LilyRecommendationsProps {
  events: EventCatalogItem[];
  plans: VenueEventPlan[];
  leadTimeDays?: number;
  venueId: string;
  onPlanNow: (event: EventCatalogItem) => Promise<void>;
  onSkip: (event: EventCatalogItem) => void;
  onRefresh: () => void;
}

function getUrgency(daysUntil: number, leadTime: number): Urgency {
  if (daysUntil <= leadTime) return 'start_now';
  if (daysUntil <= leadTime + 7) return 'soon';
  return 'low_priority';
}

const URGENCY_CONFIG: Record<Urgency, { label: string; className: string }> = {
  start_now: { label: 'Start Now', className: 'bg-destructive/15 text-destructive border-destructive/20' },
  soon: { label: 'Soon', className: 'bg-warning/15 text-warning border-warning/20' },
  low_priority: { label: 'Low Priority', className: 'bg-muted/50 text-muted-foreground border-border' },
};

const ACTION_CONFIG: Record<string, { label: string; className: string }> = {
  plan: { label: 'Plan', className: 'bg-success/15 text-success' },
  skip: { label: 'Skip', className: 'bg-muted text-muted-foreground' },
  minimal: { label: 'Minimal', className: 'bg-info/15 text-info' },
};

export function LilyRecommendations({
  events,
  plans,
  leadTimeDays = DEFAULT_LEAD_TIME,
  venueId,
  onPlanNow,
  onSkip,
  onRefresh,
}: LilyRecommendationsProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const [planning, setPlanning] = useState<string | null>(null);

  const today = new Date();

  // Build recommendation candidates — upcoming events not yet snoozed and not already having a real plan status
  const candidates: LilyEvent[] = events
    .filter(event => {
      const plan = plans.find(p => p.event_id === event.id);
      // Exclude skipped
      if (plan?.status === 'skipped') return false;
      // Exclude planned/in_production/done
      if (plan && ['planned', 'in_production', 'in_review', 'approved', 'scheduled', 'done'].includes(plan.status)) return false;
      // Exclude snoozed
      if (plan && (plan as any).snoozed_until) {
        const snoozeDate = new Date((plan as any).snoozed_until);
        if (snoozeDate > today) return false;
      }
      return true;
    })
    .map(event => {
      const daysUntil = differenceInDays(new Date(event.starts_at), today);
      return {
        event,
        plan: plans.find(p => p.event_id === event.id),
        daysUntil,
        urgency: getUrgency(daysUntil, leadTimeDays),
      };
    })
    // Only show within 60 days
    .filter(c => c.daysUntil >= 0 && c.daysUntil <= 60)
    // Sort by urgency then date
    .sort((a, b) => {
      const urgencyOrder: Record<Urgency, number> = { start_now: 0, soon: 1, low_priority: 2 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return a.daysUntil - b.daysUntil;
    })
    .slice(0, 5);

  const handleSnooze = async (candidate: LilyEvent) => {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + 7);
    setSnoozing(candidate.event.id);
    try {
      // Ensure plan exists
      let planId = candidate.plan?.id;
      if (!planId) {
        const { data } = await supabase
          .from('venue_event_plans')
          .insert({
            venue_id: venueId,
            event_id: candidate.event.id,
            title: candidate.event.title,
            starts_at: candidate.event.starts_at,
            ends_at: candidate.event.ends_at,
            status: 'not_started',
          })
          .select('id')
          .single();
        planId = data?.id;
      }
      if (planId) {
        await supabase
          .from('venue_event_plans')
          .update({ snoozed_until: snoozeUntil.toISOString() } as any)
          .eq('id', planId);
        onRefresh();
        toast({ title: 'Snoozed', description: `${candidate.event.title} will resurface in 7 days.` });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Snooze failed', description: err.message });
    } finally {
      setSnoozing(null);
    }
  };

  const handlePlanNow = async (candidate: LilyEvent) => {
    setPlanning(candidate.event.id);
    try {
      await onPlanNow(candidate.event);
    } finally {
      setPlanning(null);
    }
  };

  if (candidates.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-xl border border-accent/20 bg-gradient-to-br from-card to-card/60 overflow-hidden mb-6"
    >
      {/* Panel Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Lily avatar */}
          <div className="relative w-8 h-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">Lily's Recommendations</p>
            <p className="text-xs text-muted-foreground">
              {candidates.filter(c => c.urgency === 'start_now').length > 0
                ? `${candidates.filter(c => c.urgency === 'start_now').length} event${candidates.filter(c => c.urgency === 'start_now').length > 1 ? 's' : ''} need your attention now`
                : `${candidates.length} upcoming event${candidates.length > 1 ? 's' : ''} to review`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {candidates.filter(c => c.urgency === 'start_now').length > 0 && (
            <Badge className="bg-destructive/15 text-destructive border border-destructive/20 text-xs">
              {candidates.filter(c => c.urgency === 'start_now').length} Urgent
            </Badge>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Recommendation Cards */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="px-5 pb-5 space-y-3 border-t border-border/50">
              {candidates.map((candidate, i) => {
                const urgencyConf = URGENCY_CONFIG[candidate.urgency];
                const aiRec = candidate.plan?.ai_recommendation as any;
                const actionConf = aiRec?.action ? ACTION_CONFIG[aiRec.action] : null;

                return (
                  <motion.div
                    key={candidate.event.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="flex items-start justify-between gap-4 pt-3 first:pt-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Days counter */}
                      <div className="shrink-0 w-12 text-center pt-0.5">
                        <p className="text-xl font-semibold tabular-nums leading-none text-foreground">
                          {candidate.daysUntil}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">days</p>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium truncate">{candidate.event.title}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${urgencyConf.className}`}>
                            {urgencyConf.label}
                          </Badge>
                          {actionConf && (
                            <Badge className={`text-[10px] px-1.5 py-0 ${actionConf.className}`}>
                              {actionConf.label}
                            </Badge>
                          )}
                        </div>
                        {aiRec?.why || aiRec?.reason ? (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {aiRec.why || aiRec.reason}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {candidate.urgency === 'start_now'
                              ? 'Within your planning window — time to act.'
                              : candidate.urgency === 'soon'
                              ? 'Coming up soon, consider planning now.'
                              : 'Low urgency, keep on your radar.'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        className="h-7 text-xs px-3"
                        onClick={() => handlePlanNow(candidate)}
                        disabled={planning === candidate.event.id}
                      >
                        {planning === candidate.event.id ? (
                          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-1" />
                        ) : null}
                        Plan Now
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => onSkip(candidate.event)}
                      >
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => handleSnooze(candidate)}
                        disabled={snoozing === candidate.event.id}
                        title="Snooze 7 days"
                      >
                        <Clock className="w-3 h-3" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
