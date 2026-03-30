import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { toast } from 'sonner';

export interface AutopilotSettings {
  venue_id: string;
  is_enabled: boolean;
  frequency: 'daily' | '3x_week' | 'weekly';
  content_volume: 'low' | 'medium' | 'high';
  approval_mode: 'require_approval' | 'auto_schedule';
  run_time: string;
  created_at: string;
  updated_at: string;
}

export interface AutopilotRun {
  id: string;
  venue_id: string;
  run_type: 'daily_content' | 'weekly_campaign' | 'review_content';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial_failed';
  output_summary: Record<string, any>;
  content_item_ids: string[];
  error_message: string | null;
  parse_error: string | null;
  items_generated: number;
  items_saved: number;
  items_failed: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useAutopilotSettings() {
  const { currentVenue } = useVenue();
  const queryClient = useQueryClient();
  const venueId = currentVenue?.id;

  const settingsQuery = useQuery({
    queryKey: ['autopilot-settings', venueId],
    queryFn: async () => {
      if (!venueId) return null;
      const { data, error } = await supabase
        .from('autopilot_settings')
        .select('*')
        .eq('venue_id', venueId)
        .maybeSingle();
      if (error) throw error;
      return data as AutopilotSettings | null;
    },
    enabled: !!venueId,
  });

  const upsertSettings = useMutation({
    mutationFn: async (updates: Partial<AutopilotSettings>) => {
      if (!venueId) throw new Error('No venue');
      const { data, error } = await supabase
        .from('autopilot_settings')
        .upsert({ venue_id: venueId, ...updates }, { onConflict: 'venue_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autopilot-settings', venueId] });
      toast.success('Autopilot settings saved');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save settings'),
  });

  return { settings: settingsQuery.data, loading: settingsQuery.isLoading, upsertSettings };
}

export function useAutopilotRuns() {
  const { currentVenue } = useVenue();
  const venueId = currentVenue?.id;

  return useQuery({
    queryKey: ['autopilot-runs', venueId],
    queryFn: async () => {
      if (!venueId) return [];
      const { data, error } = await supabase
        .from('autopilot_runs')
        .select('*')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as AutopilotRun[];
    },
    enabled: !!venueId,
  });
}

export function useAutopilotTrigger() {
  const { currentVenue } = useVenue();
  const queryClient = useQueryClient();
  const venueId = currentVenue?.id;

  return useMutation({
    mutationFn: async (runType: 'daily_content' | 'weekly_campaign' | 'review_content') => {
      if (!venueId) throw new Error('No venue');
      const { data, error } = await supabase.functions.invoke('autopilot-run', {
        body: { venue_id: venueId, run_type: runType },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      if (!result) throw new Error('Autopilot returned no result');
      if (result.status === 'failed' || result.status === 'error') {
        throw new Error(result.error_message || result.error || 'Autopilot run failed');
      }
      return result;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['autopilot-runs', venueId] });
      toast.success(`Autopilot generated ${result.items_saved ?? 0} item${(result.items_saved ?? 0) === 1 ? '' : 's'} in Library`);
    },
    onError: (err: any) => toast.error(err.message || 'Autopilot run failed'),
  });
}
