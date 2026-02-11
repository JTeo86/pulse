import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, LayoutGrid, RefreshCw, Sparkles, X, SkipForward, Plus, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useEventsCatalog, useVenueEventPlans, useSeedEvents, PLAN_STATUSES } from '@/hooks/use-events';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  planned: 'Planned',
  in_production: 'In Production',
  in_review: 'In Review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  done: 'Done',
  skipped: 'Skipped',
};

const CATEGORY_COLORS: Record<string, string> = {
  holiday: 'bg-accent/20 text-accent',
  observance: 'bg-info/20 text-info',
  local_event: 'bg-success/20 text-success',
  hospitality_moment: 'bg-warning/20 text-warning',
};

export default function EventsPlannerPage() {
  const navigate = useNavigate();
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const { events, loading: eventsLoading, refetch: refetchEvents } = useEventsCatalog();
  const { plans, loading: plansLoading, createPlan, updatePlanStatus, skipPlan, fetchPlans } = useVenueEventPlans();
  const { syncing, seedHospitalityMoments, syncNagerHolidays } = useSeedEvents();

  const [skipModal, setSkipModal] = useState<{ eventId: string; title: string } | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showSkipped, setShowSkipped] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const plannedEventIds = new Set(plans.map(p => p.event_id));

  const filteredEvents = events.filter(e => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    return true;
  });

  const filteredPlans = plans.filter(p => {
    if (!showSkipped && p.status === 'skipped') return false;
    return true;
  });

  const handleSync = async () => {
    await seedHospitalityMoments();
    await syncNagerHolidays();
    await refetchEvents();
  };

  const handlePlan = async (event: any) => {
    const plan = await createPlan(event);
    if (plan) {
      navigate(`/studio/events/${plan.id}`);
    }
  };

  const handleSkip = async () => {
    if (!skipModal) return;
    // Find the plan for this event, or create one first
    let existingPlan = plans.find(p => p.event_id === skipModal.eventId);
    if (!existingPlan) {
      const event = events.find(e => e.id === skipModal.eventId);
      if (event) {
        existingPlan = await createPlan(event) as any;
      }
    }
    if (existingPlan) {
      await skipPlan(existingPlan.id, skipReason || 'No reason given');
    }
    setSkipModal(null);
    setSkipReason('');
  };

  const handleAiSuggest = async (event: any) => {
    if (!currentVenue) return;
    // Find or create plan
    let plan = plans.find(p => p.event_id === event.id);
    if (!plan) {
      plan = await createPlan(event) as any;
    }
    if (!plan) return;

    setAiLoading(event.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-event-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            venue_id: currentVenue.id,
            plan_id: plan.id,
            mode: 'suggest',
          }),
        }
      );
      const result = await res.json();
      if (result.success) {
        toast({ title: 'AI recommendation ready', description: result.data?.recommendation?.why });
        await fetchPlans();
      } else {
        toast({ variant: 'destructive', title: 'AI suggestion failed', description: result.error });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setAiLoading(null);
    }
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <PageHeader
          title="Events Planner"
          description="Plan campaigns around upcoming moments and holidays"
          action={
            <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Events
            </Button>
          }
        />

        <Tabs defaultValue="calendar" className="space-y-6">
          <div className="flex items-center gap-4 flex-wrap">
            <TabsList>
              <TabsTrigger value="calendar" className="gap-2">
                <CalendarDays className="w-4 h-4" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="board" className="gap-2">
                <LayoutGrid className="w-4 h-4" /> Board
              </TabsTrigger>
            </TabsList>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-3 h-3 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="holiday">Holidays</SelectItem>
                <SelectItem value="observance">Observances</SelectItem>
                <SelectItem value="hospitality_moment">Hospitality Moments</SelectItem>
                <SelectItem value="local_event">Local Events</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSkipped(!showSkipped)}
              className={showSkipped ? 'text-accent' : 'text-muted-foreground'}
            >
              {showSkipped ? 'Hide Skipped' : 'Show Skipped'}
            </Button>
          </div>

          {/* Calendar View */}
          <TabsContent value="calendar" className="space-y-3">
            {eventsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No upcoming events found. Click "Sync Events" to populate.</p>
              </div>
            ) : (
              filteredEvents.map(event => {
                const hasPlan = plannedEventIds.has(event.id);
                const plan = plans.find(p => p.event_id === event.id);

                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="text-center shrink-0 w-14">
                        <div className="text-xs text-muted-foreground uppercase">
                          {format(new Date(event.starts_at), 'MMM')}
                        </div>
                        <div className="text-xl font-semibold">
                          {format(new Date(event.starts_at), 'dd')}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{event.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className={CATEGORY_COLORS[event.category || ''] || 'bg-muted text-muted-foreground'}>
                            {event.category || 'general'}
                          </Badge>
                          {hasPlan && plan && (
                            <Badge variant="outline" className="text-xs">
                              {STATUS_LABELS[plan.status] || plan.status}
                            </Badge>
                          )}
                          {plan?.ai_recommendation && (
                            <Badge className="bg-accent/20 text-accent text-xs">
                              AI: {(plan.ai_recommendation as any)?.action}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {hasPlan && plan ? (
                        <Button size="sm" variant="outline" onClick={() => navigate(`/studio/events/${plan.id}`)}>
                          Open Plan
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => handlePlan(event)}>
                            <Plus className="w-3 h-3 mr-1" /> Plan
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSkipModal({ eventId: event.id, title: event.title })}
                          >
                            <SkipForward className="w-3 h-3 mr-1" /> Skip
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAiSuggest(event)}
                        disabled={aiLoading === event.id}
                      >
                        <Sparkles className={`w-3 h-3 mr-1 ${aiLoading === event.id ? 'animate-pulse' : ''}`} />
                        AI
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* Board View */}
          <TabsContent value="board">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto">
              {PLAN_STATUSES.filter(s => showSkipped || s !== 'skipped').map(status => (
                <div key={status} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {STATUS_LABELS[status]}
                    </h3>
                    <Badge variant="secondary" className="text-xs">
                      {filteredPlans.filter(p => p.status === status).length}
                    </Badge>
                  </div>
                  <div className="space-y-2 min-h-[100px]">
                    {filteredPlans.filter(p => p.status === status).map(plan => (
                      <div
                        key={plan.id}
                        className="p-3 rounded-lg border border-border bg-card cursor-pointer hover:border-accent/30 transition-colors"
                        onClick={() => navigate(`/studio/events/${plan.id}`)}
                      >
                        <p className="text-sm font-medium truncate">{plan.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(plan.starts_at), 'MMM dd, yyyy')}
                        </p>
                        <Select
                          value={plan.status}
                          onValueChange={(v) => {
                            updatePlanStatus(plan.id, v);
                          }}
                        >
                          <SelectTrigger className="mt-2 h-7 text-xs" onClick={e => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLAN_STATUSES.map(s => (
                              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Skip Modal */}
      <Dialog open={!!skipModal} onOpenChange={() => setSkipModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip "{skipModal?.title}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {['Not relevant', 'Too soon', 'No budget', 'Already covered', 'Brand mismatch'].map(r => (
                <Badge
                  key={r}
                  variant={skipReason === r ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSkipReason(r)}
                >
                  {r}
                </Badge>
              ))}
            </div>
            <Textarea
              placeholder="Optional notes..."
              value={skipReason}
              onChange={e => setSkipReason(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSkipModal(null)}>Cancel</Button>
            <Button onClick={handleSkip}>Skip Event</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
