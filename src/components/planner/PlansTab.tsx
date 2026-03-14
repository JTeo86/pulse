import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  Plus, LayoutGrid, List, CalendarDays, Sparkles, Archive, ArchiveRestore,
  Trash2, MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useVenueEventPlans } from '@/hooks/use-events';
import { useVenue } from '@/lib/venue-context';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Idea', color: 'bg-muted text-muted-foreground' },
  planned: { label: 'Planned', color: 'bg-info/15 text-info' },
  in_production: { label: 'In Production', color: 'bg-warning/15 text-warning' },
  in_review: { label: 'In Review', color: 'bg-accent/15 text-accent' },
  approved: { label: 'Approved', color: 'bg-success/15 text-success' },
  scheduled: { label: 'Scheduled', color: 'bg-info/15 text-info' },
  done: { label: 'Published', color: 'bg-success/15 text-success' },
  skipped: { label: 'Skipped', color: 'bg-muted text-muted-foreground' },
};

type ViewMode = 'list' | 'board';

export function PlansTab() {
  const navigate = useNavigate();
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const {
    plans, loading, fetchPlans,
    archivePlan, restorePlan, deletePlan,
  } = useVenueEventPlans();

  const [view, setView] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filteredPlans = plans.filter(p => {
    // Archived filter
    if (statusFilter === 'archived') return p.is_archived;
    if (p.is_archived) return false; // hide archived from all other filters

    if (statusFilter === 'active' && p.status === 'skipped') return false;
    if (statusFilter === 'active' && p.status === 'done') return false;
    if (statusFilter !== 'active' && statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCreateBlankPlan = async () => {
    if (!currentVenue) return;
    const { data, error } = await supabase
      .from('venue_event_plans')
      .insert({
        venue_id: currentVenue.id,
        title: 'New Plan',
        starts_at: new Date().toISOString(),
        status: 'not_started',
      })
      .select()
      .single();

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      return;
    }
    if (data) {
      navigate(`/content/planner/plan/${data.id}`);
    }
  };

  const handleDelete = async (planId: string) => {
    await deletePlan(planId);
    setDeleteConfirm(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search plans..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-[200px] h-8 text-sm"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="not_started">Ideas</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="in_production">In Production</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="done">Published</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border/50 rounded-md overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`p-1.5 transition-colors ${view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView('board')}
              className={`p-1.5 transition-colors ${view === 'board' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <Button size="sm" onClick={handleCreateBlankPlan} className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> New Plan
        </Button>
      </div>

      {/* Content */}
      {filteredPlans.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <h3 className="text-base font-medium text-foreground">
            {statusFilter === 'archived' ? 'No archived plans' : 'No plans yet'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {statusFilter === 'archived'
              ? 'Archive completed plans to keep your workspace tidy.'
              : 'Create a plan from an opportunity, or start a blank plan to begin your marketing workflow.'}
          </p>
          {statusFilter !== 'archived' && (
            <Button onClick={handleCreateBlankPlan} className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Create Plan
            </Button>
          )}
        </div>
      ) : view === 'list' ? (
        <div className="space-y-2">
          {filteredPlans.map((plan, i) => {
            const statusConf = STATUS_LABELS[plan.status] || STATUS_LABELS.not_started;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-card/60 hover:bg-card hover:border-border transition-colors group"
              >
                <div
                  className="flex items-center gap-4 min-w-0 flex-1 cursor-pointer"
                  onClick={() => navigate(`/content/planner/plan/${plan.id}`)}
                >
                  <div className="text-center shrink-0 w-12">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {format(new Date(plan.starts_at), 'MMM')}
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {format(new Date(plan.starts_at), 'dd')}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{plan.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={`text-[10px] border-0 ${statusConf.color}`}>
                        {statusConf.label}
                      </Badge>
                      {plan.is_archived && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Archive className="w-2.5 h-2.5" /> Archived
                        </Badge>
                      )}
                      {plan.event_id && (
                        <Badge variant="outline" className="text-[10px]">
                          <CalendarDays className="w-2.5 h-2.5 mr-1" /> Event-linked
                        </Badge>
                      )}
                      {plan.ai_recommendation && (
                        <Badge className="bg-accent/15 text-accent text-[10px] border-0">
                          <Sparkles className="w-2.5 h-2.5 mr-1" /> AI
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(plan.created_at), 'MMM d')}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => navigate(`/content/planner/plan/${plan.id}`)}>
                        Open Plan
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {plan.is_archived ? (
                        <DropdownMenuItem onClick={() => restorePlan(plan.id)}>
                          <ArchiveRestore className="w-3.5 h-3.5 mr-2" /> Restore
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => archivePlan(plan.id)}>
                          <Archive className="w-3.5 h-3.5 mr-2" /> Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteConfirm(plan.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* Board View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {['not_started', 'planned', 'in_production', 'scheduled'].map(status => {
            const statusConf = STATUS_LABELS[status] || STATUS_LABELS.not_started;
            const columnPlans = filteredPlans.filter(p => p.status === status);
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {statusConf.label}
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {columnPlans.length}
                  </Badge>
                </div>
                <div className="space-y-2 min-h-[80px]">
                  {columnPlans.map(plan => (
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
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the plan, all campaign pack outputs, creative briefs, linked assets, and checklist tasks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
