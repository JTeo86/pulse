import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarDays, LayoutGrid, RefreshCw, Sparkles, SkipForward, Plus, Filter,
  Image, Video, Play, Gift, Clock
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useEventsCatalog, useVenueEventPlans, useSeedEvents, PLAN_STATUSES, EventCatalogItem } from '@/hooks/use-events';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LilyRecommendations } from '@/components/events/LilyRecommendations';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started', planned: 'Planned', in_production: 'In Production',
  in_review: 'In Review', approved: 'Approved', scheduled: 'Scheduled', done: 'Done', skipped: 'Skipped',
};

const CATEGORY_CONFIG: Record<string, { color: string; label: string }> = {
  holiday: { color: 'bg-accent/20 text-accent', label: 'Holiday' },
  observance: { color: 'bg-info/20 text-info', label: 'Observance' },
  local_event: { color: 'bg-success/20 text-success', label: 'Local Event' },
  hospitality_moment: { color: 'bg-warning/20 text-warning', label: 'Hospitality' },
};

/* Suggested campaign angles and assets by category */
function getSuggestions(event: EventCatalogItem, daysAway: number) {
  const title = event.title.toLowerCase();
  const suggestions: { angle: string; offer: string; assets: string[] } = {
    angle: 'Seasonal promotion',
    offer: '',
    assets: ['Hero Image', 'Story'],
  };

  if (title.includes('valentine')) {
    suggestions.angle = 'Couples dining experience';
    suggestions.offer = 'Prix fixe dinner for two with complimentary prosecco';
    suggestions.assets = ['Hero Image', 'Reel', 'Story'];
  } else if (title.includes('mother')) {
    suggestions.angle = 'Celebrate mums with afternoon tea';
    suggestions.offer = 'Complimentary prosecco for mums';
    suggestions.assets = ['Hero Image', 'Reel', 'Story'];
  } else if (title.includes('father')) {
    suggestions.angle = 'Father\'s Day dining';
    suggestions.offer = 'Complimentary craft beer for dads';
    suggestions.assets = ['Hero Image', 'Story'];
  } else if (title.includes('easter')) {
    suggestions.angle = 'Easter brunch or family lunch';
    suggestions.offer = 'Easter set menu with kids eat free';
    suggestions.assets = ['Hero Image', 'Reel', 'Story'];
  } else if (title.includes('christmas') || title.includes('xmas')) {
    suggestions.angle = 'Festive season bookings';
    suggestions.offer = 'Book Christmas party packages';
    suggestions.assets = ['Hero Image', 'Reel', 'Story', 'Email'];
  } else if (title.includes('halloween')) {
    suggestions.angle = 'Halloween themed night';
    suggestions.offer = 'Themed cocktails and dress-up specials';
    suggestions.assets = ['Reel', 'Story'];
  } else if (title.includes('cocktail')) {
    suggestions.angle = 'Cocktail week specials';
    suggestions.offer = '2-for-1 signature cocktails';
    suggestions.assets = ['Reel', 'Story'];
  } else if (title.includes('brunch')) {
    suggestions.angle = 'Weekend brunch campaign';
    suggestions.offer = 'Bottomless brunch launch special';
    suggestions.assets = ['Hero Image', 'Reel'];
  } else if (title.includes('al fresco') || title.includes('terrace') || title.includes('summer')) {
    suggestions.angle = 'Outdoor dining season';
    suggestions.offer = 'Terrace opening with welcome drink';
    suggestions.assets = ['Hero Image', 'Reel', 'Story'];
  } else if (title.includes('new year')) {
    suggestions.angle = 'NYE celebration';
    suggestions.offer = 'NYE dining package with champagne toast';
    suggestions.assets = ['Hero Image', 'Reel', 'Story'];
  } else if (title.includes('dry january')) {
    suggestions.angle = 'Non-alcoholic drinks menu';
    suggestions.offer = 'Zero-proof cocktail tasting flight';
    suggestions.assets = ['Hero Image', 'Story'];
  } else if (event.category === 'holiday') {
    suggestions.angle = 'Holiday special menu';
    suggestions.offer = 'Special set menu for the occasion';
    suggestions.assets = ['Hero Image', 'Story'];
  }

  return suggestions;
}

const ASSET_ICONS: Record<string, any> = {
  'Hero Image': Image,
  'Reel': Video,
  'Story': Play,
  'Email': CalendarDays,
};

export function OpportunitiesTab() {
  const navigate = useNavigate();
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const { events, loading: eventsLoading, refetch: refetchEvents } = useEventsCatalog();
  const { plans, loading: plansLoading, createPlan, skipPlan, fetchPlans } = useVenueEventPlans();
  const { syncing, seedHospitalityMoments, syncNagerHolidays } = useSeedEvents();

  const [skipModal, setSkipModal] = useState<{ eventId: string; title: string; event?: EventCatalogItem } | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showSkipped, setShowSkipped] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const plannedEventIds = new Set(plans.map(p => p.event_id));
  const leadTimeDays = (currentVenue as any)?.default_lead_time_days ?? 21;

  const filteredEvents = events.filter(e => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    return true;
  });

  const handleSync = async () => {
    await seedHospitalityMoments();
    await syncNagerHolidays();
    await refetchEvents();
  };

  const handleCreatePlan = async (event: EventCatalogItem) => {
    const plan = await createPlan(event);
    if (plan) {
      navigate(`/content/planner/plan/${plan.id}`);
    }
  };

  const handleSkipOpen = (event: EventCatalogItem) => {
    setSkipModal({ eventId: event.id, title: event.title, event });
  };

  const handleSkip = async () => {
    if (!skipModal) return;
    let existingPlan = plans.find(p => p.event_id === skipModal.eventId);
    if (!existingPlan && skipModal.event) {
      existingPlan = await createPlan(skipModal.event) as any;
    }
    if (existingPlan) {
      await skipPlan(existingPlan.id, skipReason || 'No reason given');
    }
    setSkipModal(null);
    setSkipReason('');
  };

  const handleAiSuggest = async (event: EventCatalogItem) => {
    if (!currentVenue) return;
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
    <div className="space-y-6">
      {/* Lily Recommendations */}
      {!eventsLoading && !plansLoading && currentVenue && (
        <LilyRecommendations
          events={events}
          plans={plans}
          leadTimeDays={leadTimeDays}
          venueId={currentVenue.id}
          onPlanNow={handleCreatePlan}
          onSkip={handleSkipOpen}
          onRefresh={fetchPlans}
        />
      )}

      {/* View controls */}
      <Tabs defaultValue="calendar" className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <TabsList className="bg-muted/20">
              <TabsTrigger value="calendar" className="gap-1.5 text-xs">
                <CalendarDays className="w-3.5 h-3.5" /> Calendar
              </TabsTrigger>
              <TabsTrigger value="board" className="gap-1.5 text-xs">
                <LayoutGrid className="w-3.5 h-3.5" /> Board
              </TabsTrigger>
            </TabsList>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <Filter className="w-3 h-3 mr-1.5" />
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
              className={`text-xs ${showSkipped ? 'text-accent' : 'text-muted-foreground'}`}
            >
              {showSkipped ? 'Hide Skipped' : 'Show Skipped'}
            </Button>
          </div>

          <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync Events
          </Button>
        </div>

        {/* Calendar View — Enhanced Cards */}
        <TabsContent value="calendar" className="space-y-2">
          {eventsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No upcoming events found.</p>
              <p className="text-xs mt-1">Click "Sync Events" to populate your marketing calendar.</p>
            </div>
          ) : (
            filteredEvents.map((event, i) => {
              const hasPlan = plannedEventIds.has(event.id);
              const plan = plans.find(p => p.event_id === event.id);
              const daysAway = differenceInDays(new Date(event.starts_at), new Date());
              const isExpanded = expandedCard === event.id;
              const suggestions = getSuggestions(event, daysAway);
              const catConf = CATEGORY_CONFIG[event.category || ''] || { color: 'bg-muted text-muted-foreground', label: 'General' };

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="rounded-lg border border-border/50 bg-card/60 hover:bg-card transition-colors overflow-hidden"
                >
                  {/* Main Row */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer"
                    onClick={() => setExpandedCard(isExpanded ? null : event.id)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="text-center shrink-0 w-14">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {format(new Date(event.starts_at), 'MMM')}
                        </div>
                        <div className="text-xl font-semibold tabular-nums">
                          {format(new Date(event.starts_at), 'dd')}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{event.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="secondary" className={`text-[10px] ${catConf.color}`}>
                            {catConf.label}
                          </Badge>
                          {daysAway >= 0 && (
                            <span className="text-[10px] text-muted-foreground">{daysAway}d away</span>
                          )}
                          {hasPlan && plan && (
                            <Badge variant="outline" className="text-[10px]">
                              {STATUS_LABELS[plan.status] || plan.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {hasPlan && plan ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/content/planner/plan/${plan.id}`)}>
                          Open Plan
                        </Button>
                      ) : (
                        <Button size="sm" className="h-7 text-xs" onClick={() => handleCreatePlan(event)}>
                          <Plus className="w-3 h-3 mr-1" /> Create Plan
                        </Button>
                      )}
                      {!hasPlan && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleSkipOpen(event)}>
                          <SkipForward className="w-3 h-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => handleAiSuggest(event)}
                        disabled={aiLoading === event.id}
                      >
                        <Sparkles className={`w-3 h-3 ${aiLoading === event.id ? 'animate-pulse' : ''}`} />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Lily Suggestion */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-4 border-t border-border/30"
                    >
                      <div className="pt-3 space-y-3">
                        <div className="flex items-start gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-accent">Lily's suggestion</p>
                            <p className="text-sm text-foreground mt-0.5">{suggestions.angle}</p>
                          </div>
                        </div>

                        {suggestions.offer && (
                          <div className="flex items-start gap-2">
                            <Gift className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-warning">Suggested offer</p>
                              <p className="text-sm text-muted-foreground">{suggestions.offer}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Assets:</span>
                          {suggestions.assets.map(a => {
                            const Icon = ASSET_ICONS[a] || Image;
                            return (
                              <Badge key={a} variant="outline" className="text-[10px] gap-1">
                                <Icon className="w-2.5 h-2.5" /> {a}
                              </Badge>
                            );
                          })}
                        </div>

                        {/* AI recommendation if available */}
                        {plan?.ai_recommendation && (
                          <div className="rounded-lg bg-accent/5 border border-accent/20 p-3">
                            <p className="text-xs text-muted-foreground">
                              {(plan.ai_recommendation as any)?.why || 'AI analysis available'}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })
          )}
        </TabsContent>

        {/* Board View */}
        <TabsContent value="board">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLAN_STATUSES.filter(s => showSkipped || s !== 'skipped').map(status => (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {STATUS_LABELS[status]}
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {plans.filter(p => p.status === status && (showSkipped || p.status !== 'skipped')).length}
                  </Badge>
                </div>
                <div className="space-y-2 min-h-[80px]">
                  {plans.filter(p => p.status === status && (showSkipped || p.status !== 'skipped')).map(plan => (
                    <div
                      key={plan.id}
                      className="p-3 rounded-lg border border-border/50 bg-card/60 cursor-pointer hover:border-accent/20 transition-colors"
                      onClick={() => navigate(`/content/planner/plan/${plan.id}`)}
                    >
                      <p className="text-sm font-medium truncate">{plan.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(plan.starts_at), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
