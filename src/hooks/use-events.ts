import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useToast } from '@/hooks/use-toast';

export interface EventCatalogItem {
  id: string;
  source: string;
  source_id: string | null;
  country_code: string | null;
  city: string | null;
  starts_at: string;
  ends_at: string | null;
  title: string;
  category: string | null;
  url: string | null;
}

export interface VenueEventPlan {
  id: string;
  venue_id: string;
  event_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  decision: Record<string, any>;
  skip_reason: string | null;
  ai_recommendation: Record<string, any> | null;
  deployed_at: string | null;
  created_at: string;
}

export interface EventPlanTask {
  id: string;
  plan_id: string;
  title: string;
  is_done: boolean;
  sort_order: number;
}

export interface EventPlanLink {
  id: string;
  plan_id: string;
  content_item_id: string | null;
  copy_project_id: string | null;
  kind: string;
}

const PLAN_STATUSES = [
  'not_started', 'planned', 'in_production', 'in_review',
  'approved', 'scheduled', 'done', 'skipped'
] as const;

export { PLAN_STATUSES };

export function useEventsCatalog() {
  const { currentVenue } = useVenue();
  const [events, setEvents] = useState<EventCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!currentVenue) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('events_catalog')
        .select('*')
        .gte('starts_at', now)
        .lte('starts_at', future)
        .or(`country_code.eq.${(currentVenue as any).country_code || 'GB'},country_code.is.null`)
        .order('starts_at', { ascending: true });

      if (error) throw error;
      setEvents((data as any[]) || []);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  }, [currentVenue]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  return { events, loading, refetch: fetchEvents };
}

export function useVenueEventPlans() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const [plans, setPlans] = useState<VenueEventPlan[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchPlans = useCallback(async () => {
    if (!currentVenue) return;
    try {
      const { data, error } = await supabase
        .from('venue_event_plans')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .order('starts_at', { ascending: true });

      if (error) throw error;
      setPlans((data as any[]) || []);
    } catch (err: any) {
      console.error('Error fetching plans:', err);
    } finally {
      if (!hasFetched.current) {
        hasFetched.current = true;
        setInitialLoading(false);
      }
    }
  }, [currentVenue]);

  useEffect(() => {
    hasFetched.current = false;
    setInitialLoading(true);
    fetchPlans();
  }, [fetchPlans]);

  const createPlan = async (event: EventCatalogItem) => {
    if (!currentVenue) return null;
    const { data, error } = await supabase
      .from('venue_event_plans')
      .insert({
        venue_id: currentVenue.id,
        event_id: event.id,
        title: event.title,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        status: 'not_started',
      })
      .select()
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error creating plan', description: error.message });
      return null;
    }
    // Optimistic append
    if (data) setPlans(prev => [...prev, data as any as VenueEventPlan]);
    return data as any as VenueEventPlan;
  };

  const updatePlanStatus = async (planId: string, status: string) => {
    // Optimistic
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, status } : p));
    const { error } = await supabase
      .from('venue_event_plans')
      .update({ status })
      .eq('id', planId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error updating plan', description: error.message });
      fetchPlans(); // rollback
    }
  };

  const skipPlan = async (planId: string, reason: string) => {
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, status: 'skipped', skip_reason: reason } : p));
    const { error } = await supabase
      .from('venue_event_plans')
      .update({ status: 'skipped', skip_reason: reason })
      .eq('id', planId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error skipping plan', description: error.message });
      fetchPlans();
    }
  };

  return { plans, loading: initialLoading, fetchPlans, createPlan, updatePlanStatus, skipPlan };
}

export function useEventPlanDetail(planId: string | undefined) {
  const [plan, setPlan] = useState<VenueEventPlan | null>(null);
  const [tasks, setTasks] = useState<EventPlanTask[]>([]);
  const [links, setLinks] = useState<EventPlanLink[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasFetched = useRef(false);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    if (!planId) return;
    try {
      const [planRes, tasksRes, linksRes] = await Promise.all([
        supabase.from('venue_event_plans').select('*').eq('id', planId).single(),
        supabase.from('event_plan_tasks').select('*').eq('plan_id', planId).order('sort_order'),
        supabase.from('event_plan_links').select('*').eq('plan_id', planId),
      ]);

      if (planRes.error) throw planRes.error;
      setPlan(planRes.data as any);
      setTasks((tasksRes.data as any[]) || []);
      setLinks((linksRes.data as any[]) || []);
    } catch (err: any) {
      console.error('Error fetching plan detail:', err);
    } finally {
      if (!hasFetched.current) {
        hasFetched.current = true;
        setInitialLoading(false);
      }
    }
  }, [planId]);

  useEffect(() => {
    hasFetched.current = false;
    setInitialLoading(true);
    fetchAll();
  }, [fetchAll]);

  /* ── Optimistic: update decision (no refetch) ── */
  const updateDecision = useCallback(async (decision: Record<string, any>) => {
    if (!planId) return;
    // Optimistic local patch
    setPlan(prev => prev ? { ...prev, decision } as VenueEventPlan : prev);
    const { error } = await supabase
      .from('venue_event_plans')
      .update({ decision })
      .eq('id', planId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      // Rollback — refetch
      fetchAll();
    }
  }, [planId, fetchAll, toast]);

  /* ── Optimistic: toggle task ── */
  const toggleTask = useCallback(async (taskId: string, isDone: boolean) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_done: isDone } : t));
    const { error } = await supabase
      .from('event_plan_tasks')
      .update({ is_done: isDone })
      .eq('id', taskId);
    if (error) fetchAll();
  }, [fetchAll]);

  /* ── Optimistic: add task ── */
  const addTask = useCallback(async (title: string) => {
    if (!planId) return;
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.sort_order), 0);
    const tempId = crypto.randomUUID();
    const temp: EventPlanTask = { id: tempId, plan_id: planId, title, is_done: false, sort_order: maxOrder + 1 };
    setTasks(prev => [...prev, temp]);

    const { data, error } = await supabase
      .from('event_plan_tasks')
      .insert({ plan_id: planId, title, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error) {
      setTasks(prev => prev.filter(t => t.id !== tempId));
    } else if (data) {
      // Replace temp with real record
      setTasks(prev => prev.map(t => t.id === tempId ? (data as any as EventPlanTask) : t));
    }
  }, [planId, tasks]);

  /* ── Optimistic: delete task ── */
  const deleteTask = useCallback(async (taskId: string) => {
    const snapshot = [...tasks];
    setTasks(prev => prev.filter(t => t.id !== taskId));
    const { error } = await supabase
      .from('event_plan_tasks')
      .delete()
      .eq('id', taskId);
    if (error) setTasks(snapshot);
  }, [tasks]);

  /* ── Optimistic: update status ── */
  const updateStatus = useCallback(async (status: string) => {
    if (!planId) return;
    const prevStatus = plan?.status;
    setPlan(prev => prev ? { ...prev, status } as VenueEventPlan : prev);
    const updates: any = { status };
    if (status === 'in_production') updates.deployed_at = new Date().toISOString();
    const { error } = await supabase
      .from('venue_event_plans')
      .update(updates)
      .eq('id', planId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      setPlan(prev => prev ? { ...prev, status: prevStatus || 'not_started' } as VenueEventPlan : prev);
    }
  }, [planId, plan?.status, toast]);

  /* ── Optimistic: update title ── */
  const updateTitle = useCallback(async (title: string) => {
    if (!planId || !title.trim()) return;
    setPlan(prev => prev ? { ...prev, title: title.trim() } as VenueEventPlan : prev);
    const { error } = await supabase
      .from('venue_event_plans')
      .update({ title: title.trim() })
      .eq('id', planId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      fetchAll();
    }
  }, [planId, fetchAll, toast]);

  return {
    plan, tasks, links,
    loading: initialLoading,
    fetchAll,
    updateDecision, toggleTask, addTask, deleteTask, updateStatus, updateTitle,
  };
}

export function useSeedEvents() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const seedHospitalityMoments = async () => {
    if (!currentVenue) return;
    setSyncing(true);
    const cc = (currentVenue as any).country_code || 'GB';
    const year = new Date().getFullYear();

    const moments = [
      { title: "Valentine's Day", starts_at: `${year}-02-14`, category: 'holiday' },
      { title: "Mother's Day", starts_at: cc === 'GB' ? `${year}-03-30` : `${year}-05-11`, category: 'holiday' },
      { title: "Easter Weekend", starts_at: `${year}-04-20`, category: 'holiday' },
      { title: "May Bank Holiday", starts_at: `${year}-05-05`, category: 'holiday' },
      { title: "Father's Day", starts_at: `${year}-06-15`, category: 'holiday' },
      { title: "Summer Solstice", starts_at: `${year}-06-21`, category: 'hospitality_moment' },
      { title: "Independence Day", starts_at: `${year}-07-04`, category: 'holiday' },
      { title: "August Bank Holiday", starts_at: `${year}-08-25`, category: 'holiday' },
      { title: "Halloween", starts_at: `${year}-10-31`, category: 'holiday' },
      { title: "Bonfire Night", starts_at: `${year}-11-05`, category: 'holiday' },
      { title: "Black Friday", starts_at: `${year}-11-28`, category: 'hospitality_moment' },
      { title: "Christmas Eve", starts_at: `${year}-12-24`, category: 'holiday' },
      { title: "Christmas Day", starts_at: `${year}-12-25`, category: 'holiday' },
      { title: "New Year's Eve", starts_at: `${year}-12-31`, category: 'holiday' },
      { title: "Brunch Season Launch", starts_at: `${year}-03-01`, category: 'hospitality_moment' },
      { title: "Al Fresco Season", starts_at: `${year}-05-15`, category: 'hospitality_moment' },
      { title: "Cocktail Week", starts_at: `${year}-10-06`, category: 'hospitality_moment' },
      { title: "Dry January", starts_at: `${year + 1}-01-01`, category: 'hospitality_moment' },
    ];

    try {
      for (const m of moments) {
        await supabase
          .from('events_catalog')
          .upsert(
            {
              source: 'manual',
              source_id: `hospitality_${m.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${year}`,
              country_code: cc,
              title: m.title,
              starts_at: new Date(m.starts_at).toISOString(),
              category: m.category,
            },
            { onConflict: 'source,source_id' }
          );
      }
      toast({ title: 'Events synced', description: `${moments.length} hospitality moments added.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Sync failed', description: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const syncNagerHolidays = async () => {
    if (!currentVenue) return;
    setSyncing(true);
    const cc = (currentVenue as any).country_code || 'GB';
    const year = new Date().getFullYear();

    try {
      const nextYear = year + 1;
      const [res1, res2] = await Promise.all([
        fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`),
        fetch(`https://date.nager.at/api/v3/PublicHolidays/${nextYear}/${cc}`),
      ]);
      if (!res1.ok) throw new Error('Nager API failed for current year');
      const holidays1 = await res1.json();
      const holidays2 = res2.ok ? await res2.json() : [];
      const allHolidays = [...holidays1, ...holidays2];

      for (const h of allHolidays) {
        await supabase
          .from('events_catalog')
          .upsert(
            {
              source: 'nager',
              source_id: `nager_${h.date}_${cc}`,
              country_code: cc,
              title: h.localName || h.name,
              starts_at: new Date(h.date).toISOString(),
              category: h.types?.includes('Public') ? 'holiday' : 'observance',
              raw: h,
            },
            { onConflict: 'source,source_id' }
          );
      }
      toast({ title: 'Holidays synced', description: `${allHolidays.length} public holidays imported.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Holiday sync failed', description: err.message });
    } finally {
      setSyncing(false);
    }
  };

  return { syncing, seedHospitalityMoments, syncNagerHolidays };
}
