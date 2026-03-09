import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CalendarDays, 
  Check, 
  X, 
  Pencil, 
  Camera, 
  Film, 
  Megaphone, 
  MessageSquareText, 
  Star, 
  Sparkles,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

interface MarketingTask {
  id: string;
  day: string;
  time: string;
  task_type: string;
  title: string;
  description: string;
  priority: string;
  status: 'pending' | 'approved' | 'dismissed' | 'completed';
  sort_order: number;
}

interface MarketingPlan {
  id: string;
  venue_id: string;
  week_start: string;
  plan_data: MarketingTask[];
  status: string;
  created_at: string;
  approved_at: string | null;
}

const TASK_ICONS: Record<string, any> = {
  photo_post: Camera,
  reel: Film,
  campaign: Megaphone,
  review_response: MessageSquareText,
  promotion: Star,
  story: Sparkles,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function WeeklyMarketingPlan() {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const [plan, setPlan] = useState<MarketingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchPlan = useCallback(async () => {
    if (!currentVenue) return;
    
    // Get current week Monday
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    try {
      const { data, error } = await supabase
        .from('marketing_plans')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .eq('week_start', weekStartStr)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setPlan({
          ...data,
          plan_data: (data.plan_data as unknown as MarketingTask[]) || [],
        } as MarketingPlan);
      } else {
        setPlan(null);
      }
    } catch (err) {
      console.error('Error fetching marketing plan:', err);
    } finally {
      setLoading(false);
    }
  }, [currentVenue]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handleGenerate = async () => {
    if (!currentVenue) return;
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('generate-marketing-plan', {
        body: { venue_id: currentVenue.id },
      });
      if (error) throw error;
      await fetchPlan();
      toast({ title: 'Marketing plan generated!' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleTaskAction = async (taskId: string, newStatus: 'approved' | 'dismissed') => {
    if (!plan) return;
    
    const updatedTasks = plan.plan_data.map((task) =>
      task.id === taskId ? { ...task, status: newStatus } : task
    );

    try {
      const { error } = await supabase
        .from('marketing_plans')
        .update({ plan_data: updatedTasks as unknown as Record<string, unknown>[] })
        .eq('id', plan.id);

      if (error) throw error;
      setPlan({ ...plan, plan_data: updatedTasks });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Update failed', description: err.message });
    }
  };

  const handleApproveAll = async () => {
    if (!plan) return;
    
    const updatedTasks = plan.plan_data.map((task) =>
      task.status === 'pending' ? { ...task, status: 'approved' as const } : task
    );

    try {
      const { error } = await supabase
        .from('marketing_plans')
        .update({
          plan_data: updatedTasks,
          status: 'approved',
          approved_at: new Date().toISOString(),
        })
        .eq('id', plan.id);

      if (error) throw error;
      setPlan({ ...plan, plan_data: updatedTasks, status: 'approved', approved_at: new Date().toISOString() });
      toast({ title: 'Plan approved! Tasks will be scheduled.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Approval failed', description: err.message });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // No plan yet — show generation CTA
  if (!plan) {
    return (
      <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-medium text-lg">Marketing Autopilot</h3>
                <p className="text-sm text-muted-foreground">
                  Generate an AI-powered weekly marketing plan for your venue
                </p>
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Plan
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group tasks by day
  const tasksByDay: Record<string, MarketingTask[]> = {};
  for (const task of plan.plan_data) {
    if (!tasksByDay[task.day]) tasksByDay[task.day] = [];
    tasksByDay[task.day].push(task);
  }

  const pendingCount = plan.plan_data.filter((t) => t.status === 'pending').length;
  const approvedCount = plan.plan_data.filter((t) => t.status === 'approved').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-accent" />
          </div>
          <div>
            <CardTitle className="text-lg">Weekly Marketing Plan</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Week of {new Date(plan.week_start).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
              {plan.status === 'approved' && (
                <Badge variant="secondary" className="ml-2 text-[10px]">Approved</Badge>
              )}
            </p>
          </div>
        </div>
        {pendingCount > 0 && (
          <Button size="sm" onClick={handleApproveAll}>
            <Check className="w-4 h-4 mr-1" />
            Approve All ({pendingCount})
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {DAY_ORDER.map((day) => {
          const tasks = tasksByDay[day];
          if (!tasks || tasks.length === 0) return null;

          return (
            <div key={day} className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-2">
                {day}
              </p>
              <AnimatePresence>
                {tasks.map((task) => {
                  const TaskIcon = TASK_ICONS[task.task_type] || Sparkles;
                  const isDismissed = task.status === 'dismissed';
                  const isApproved = task.status === 'approved';

                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: isDismissed ? 0.5 : 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg border transition-colors
                        ${isApproved ? 'bg-accent/5 border-accent/20' : 'bg-card border-border'}
                        ${isDismissed ? 'line-through opacity-50' : ''}
                      `}
                    >
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <TaskIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] shrink-0 ${PRIORITY_COLORS[task.priority] || ''}`}
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {task.time} · {task.description}
                        </p>
                      </div>
                      {task.status === 'pending' && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-accent hover:bg-accent/10"
                            onClick={() => handleTaskAction(task.id, 'approved')}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleTaskAction(task.id, 'dismissed')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                      {isApproved && (
                        <Check className="w-4 h-4 text-accent shrink-0" />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          );
        })}

        {approvedCount > 0 && pendingCount === 0 && (
          <p className="text-xs text-center text-muted-foreground pt-3">
            All {approvedCount} tasks approved for this week ✓
          </p>
        )}
      </CardContent>
    </Card>
  );
}
