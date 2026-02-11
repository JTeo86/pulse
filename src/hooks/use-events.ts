import { useState, useEffect, useCallback } from 'react';
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
      const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

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
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    if (!currentVenue) return;
    setLoading(true);
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
      setLoading(false);
    }
  }, [currentVenue]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

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
    await fetchPlans();
    return data as any as VenueEventPlan;
  };

  const updatePlanStatus = async (planId: string, status: string) => {
    const { error } = await supabase
      .from('venue_event_plans')
      .update({ status })
      .eq('id', planId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error updating plan', description: error.message });
      return;
    }
    await fetchPlans();
  };

  const skipPlan = async (planId: string, reason: string) => {
    const { error } = await supabase
      .from('venue_event_plans')
      .update({ status: 'skipped', skip_reason: reason })
      .eq('id', planId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error skipping plan', description: error.message });
      return;
    }
    await fetchPlans();
  };

  return { plans, loading, fetchPlans, createPlan, updatePlanStatus, skipPlan };
}

export function useEventPlanDetail(planId: string | undefined) {
  const [plan, setPlan] = useState<VenueEventPlan | null>(null);
  const [tasks, setTasks] = useState<EventPlanTask[]>([]);
  const [links, setLinks] = useState<EventPlanLink[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
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
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateDecision = async (decision: Record<string, any>) => {
    if (!planId) return;
    const { error } = await supabase
      .from('venue_event_plans')
      .update({ decision })
      .eq('id', planId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      await fetchAll();
    }
  };

  const toggleTask = async (taskId: string, isDone: boolean) => {
    const { error } = await supabase
      .from('event_plan_tasks')
      .update({ is_done: isDone })
      .eq('id', taskId);
    if (!error) await fetchAll();
  };

  const addTask = async (title: string) => {
    if (!planId) return;
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.sort_order), 0);
    const { error } = await supabase
      .from('event_plan_tasks')
      .insert({ plan_id: planId, title, sort_order: maxOrder + 1 });
    if (!error) await fetchAll();
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase
      .from('event_plan_tasks')
      .delete()
      .eq('id', taskId);
    if (!error) await fetchAll();
  };

  const updateStatus = async (status: string) => {
    if (!planId) return;
    const updates: any = { status };
    if (status === 'in_production') updates.deployed_at = new Date().toISOString();
    const { error } = await supabase
      .from('venue_event_plans')
      .update(updates)
      .eq('id', planId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      await fetchAll();
    }
  };

  return { plan, tasks, links, loading, fetchAll, updateDecision, toggleTask, addTask, deleteTask, updateStatus };
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
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`);
      if (!res.ok) throw new Error('Nager API failed');
      const holidays = await res.json();

      for (const h of holidays) {
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
      toast({ title: 'Holidays synced', description: `${holidays.length} public holidays imported.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Holiday sync failed', description: err.message });
    } finally {
      setSyncing(false);
    }
  };

  return { syncing, seedHospitalityMoments, syncNagerHolidays };
}
