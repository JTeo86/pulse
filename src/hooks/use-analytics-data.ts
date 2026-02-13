import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { startOfMonth, subMonths, format, startOfWeek, endOfWeek, eachDayOfInterval, eachMonthOfInterval, isWithinInterval, parseISO } from 'date-fns';

export interface ActivityMetrics {
  totalUploads: number;
  totalContentItems: number;
  totalEditedAssets: number;
  totalCopyProjects: number;
  totalEventPlans: number;
  contentByStatus: Record<string, number>;
  contentByMonth: { month: string; uploads: number; edits: number; copy: number }[];
  contentByType: { name: string; value: number }[];
  recentActivity: { date: string; type: string; title: string }[];
  weeklyActivity: { day: string; count: number }[];
}

export function useAnalyticsData() {
  const { currentVenue } = useVenue();
  const venueId = currentVenue?.id;

  return useQuery({
    queryKey: ['analytics', venueId],
    queryFn: async (): Promise<ActivityMetrics> => {
      if (!venueId) throw new Error('No venue selected');

      const sixMonthsAgo = subMonths(new Date(), 6).toISOString();

      const [uploadsRes, contentRes, editedRes, copyRes, eventPlansRes] = await Promise.all([
        supabase.from('uploads').select('id, created_at, status').eq('venue_id', venueId).gte('created_at', sixMonthsAgo),
        supabase.from('content_items').select('id, created_at, status, asset_type, intent').eq('venue_id', venueId),
        supabase.from('edited_assets').select('id, created_at, output_types').eq('venue_id', venueId).gte('created_at', sixMonthsAgo),
        supabase.from('copy_projects').select('id, created_at, module, goal').eq('venue_id', venueId).gte('created_at', sixMonthsAgo),
        supabase.from('venue_event_plans').select('id, created_at, status, title').eq('venue_id', venueId),
      ]);

      const uploads = uploadsRes.data || [];
      const content = contentRes.data || [];
      const edited = editedRes.data || [];
      const copy = copyRes.data || [];
      const eventPlans = eventPlansRes.data || [];

      // Status breakdown
      const contentByStatus: Record<string, number> = {};
      content.forEach(c => {
        const s = c.status || 'draft';
        contentByStatus[s] = (contentByStatus[s] || 0) + 1;
      });

      // Monthly trends
      const months = eachMonthOfInterval({
        start: subMonths(new Date(), 5),
        end: new Date(),
      });

      const contentByMonth = months.map(m => {
        const monthStr = format(m, 'MMM yyyy');
        const start = startOfMonth(m);
        const end = startOfMonth(subMonths(m, -1));
        const interval = { start, end };

        return {
          month: format(m, 'MMM'),
          uploads: uploads.filter(u => isWithinInterval(parseISO(u.created_at), interval)).length,
          edits: edited.filter(e => isWithinInterval(parseISO(e.created_at), interval)).length,
          copy: copy.filter(c => isWithinInterval(parseISO(c.created_at), interval)).length,
        };
      });

      // Content type breakdown
      const typeMap: Record<string, number> = {};
      content.forEach(c => {
        const t = c.asset_type || 'static';
        typeMap[t] = (typeMap[t] || 0) + 1;
      });
      const contentByType = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

      // Weekly activity (this week)
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

      const allDatedItems = [
        ...uploads.map(u => ({ date: u.created_at })),
        ...edited.map(e => ({ date: e.created_at })),
        ...copy.map(c => ({ date: c.created_at })),
      ];

      const weeklyActivity = weekDays.map(d => ({
        day: format(d, 'EEE'),
        count: allDatedItems.filter(item => {
          const itemDate = parseISO(item.date);
          return format(itemDate, 'yyyy-MM-dd') === format(d, 'yyyy-MM-dd');
        }).length,
      }));

      // Recent activity
      const recentItems = [
        ...uploads.map(u => ({ date: u.created_at, type: 'Upload', title: 'Photo uploaded' })),
        ...edited.map(e => ({ date: e.created_at, type: 'Edit', title: 'Asset edited' })),
        ...copy.map(c => ({ date: c.created_at, type: 'Copy', title: c.goal || 'Copy project' })),
        ...eventPlans.map(p => ({ date: p.created_at, type: 'Event', title: p.title })),
      ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);

      return {
        totalUploads: uploads.length,
        totalContentItems: content.length,
        totalEditedAssets: edited.length,
        totalCopyProjects: copy.length,
        totalEventPlans: eventPlans.length,
        contentByStatus,
        contentByMonth,
        contentByType,
        recentActivity: recentItems,
        weeklyActivity,
      };
    },
    enabled: !!venueId,
  });
}
