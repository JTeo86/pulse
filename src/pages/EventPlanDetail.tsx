import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, CheckCircle2, Circle, Plus, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useEventPlanDetail, PLAN_STATUSES } from '@/hooks/use-events';
import { useVenue } from '@/lib/venue-context';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started', planned: 'Planned', in_production: 'In Production',
  in_review: 'In Review', approved: 'Approved', scheduled: 'Scheduled', done: 'Done', skipped: 'Skipped',
};

export default function EventPlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const { plan, tasks, links, loading, fetchAll, updateDecision, toggleTask, addTask, deleteTask, updateStatus } = useEventPlanDetail(planId);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [localOfferTerms, setLocalOfferTerms] = useState('');
  const isEditingRef = useRef(false);

  // Sync local state from DB when not actively editing
  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalOfferTerms(plan?.decision?.offer_terms || '');
    }
  }, [plan?.decision?.offer_terms]);

  // Debounced save
  useEffect(() => {
    if (!isEditingRef.current) return;
    const timer = setTimeout(() => {
      const current = plan?.decision || {};
      if (localOfferTerms !== (current.offer_terms || '')) {
        updateDecision({ ...current, offer_terms: localOfferTerms });
      }
      isEditingRef.current = false;
    }, 800);
    return () => clearTimeout(timer);
  }, [localOfferTerms]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="text-center py-20 text-muted-foreground">Plan not found.</div>
    );
  }

  const decision = plan.decision || {};

  const handleToggle = (key: string, val: boolean) => {
    updateDecision({ ...decision, [key]: val });
  };

  const handleOfferTerms = (val: string) => {
    updateDecision({ ...decision, offer_terms: val });
  };

  const handleGenerate = async () => {
    if (!currentVenue || !planId) return;
    setGenerating(true);
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
            plan_id: planId,
            mode: 'full',
          }),
        }
      );
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Campaign plan generated!', description: 'Tasks and content drafts created.' });
        await fetchAll();
      } else {
        toast({ variant: 'destructive', title: 'Generation failed', description: result.error });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeploy = () => {
    updateStatus('in_production');
    toast({ title: 'Content pack deployed', description: 'Status set to In Production.' });
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    addTask(newTaskTitle.trim());
    setNewTaskTitle('');
  };

  const rec = plan.ai_recommendation as any;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link to="/studio/events">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <h1 className="text-2xl font-serif font-medium">{plan.title}</h1>
              <p className="text-sm text-muted-foreground">
                {format(new Date(plan.starts_at), 'MMMM dd, yyyy')}
                {plan.ends_at && ` — ${format(new Date(plan.ends_at), 'MMMM dd, yyyy')}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={plan.status} onValueChange={(v) => updateStatus(v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleDeploy} disabled={plan.status === 'in_production' || plan.status === 'done'}>
              Deploy Content Pack
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Recommendation */}
            {rec && (
              <div className="card-elevated p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  <h3 className="font-medium">AI Recommendation</h3>
                  <Badge className={rec.action === 'plan' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}>
                    {rec.action === 'plan' ? 'Recommended' : 'Skip Suggested'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{rec.why}</p>
                {rec.angles?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {rec.angles.map((a: string, i: number) => (
                      <Badge key={i} variant="outline">{a}</Badge>
                    ))}
                  </div>
                )}
                {rec.channels?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {rec.channels.map((c: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Generate Campaign */}
            <div className="card-elevated p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Campaign Plan</h3>
                  <p className="text-sm text-muted-foreground">Generate tasks and content drafts using AI</p>
                </div>
                <Button onClick={handleGenerate} disabled={generating}>
                  <Sparkles className={`w-4 h-4 mr-2 ${generating ? 'animate-pulse' : ''}`} />
                  {generating ? 'Generating...' : 'Generate Campaign Plan'}
                </Button>
              </div>
            </div>

            {/* Checklist */}
            <div className="card-elevated p-5 space-y-4">
              <h3 className="font-medium">Checklist</h3>
              <div className="space-y-2">
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 group">
                    <button onClick={() => toggleTask(task.id, !task.is_done)} className="shrink-0">
                      {task.is_done ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    <span className={`flex-1 text-sm ${task.is_done ? 'line-through text-muted-foreground' : ''}`}>
                      {task.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 h-7 w-7"
                      onClick={() => deleteTask(task.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a task..."
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            </div>

            {/* Generated Content */}
            <div className="card-elevated p-5 space-y-4">
              <h3 className="font-medium">Generated Content</h3>
              {links.length === 0 ? (
                <p className="text-sm text-muted-foreground">No content generated yet. Use "Generate Campaign Plan" above.</p>
              ) : (
                <div className="space-y-2">
                  {links.map(link => (
                    <div key={link.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div>
                        <Badge variant="secondary" className="text-xs">{link.kind}</Badge>
                        <span className="text-sm ml-2">
                          {link.content_item_id ? `Content Item` : `Copy Project`}
                        </span>
                      </div>
                      <Link
                        to={link.content_item_id ? '/studio/editor' : '/studio/content'}
                        className="text-accent hover:underline text-sm flex items-center gap-1"
                      >
                        Open in Studio <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Decisions */}
            <div className="card-elevated p-5 space-y-4">
              <h3 className="font-medium">Decisions</h3>
              {[
                { key: 'run_offer', label: 'Run offer?' },
                { key: 'run_event_promo', label: 'Run event promotion?' },
                { key: 'run_menu_highlight', label: 'Run menu highlight?' },
                { key: 'run_brand_story', label: 'Run brand story?' },
                { key: 'run_last_minute', label: 'Run last-minute fill?' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-sm">{label}</Label>
                  <Switch
                    checked={!!decision[key]}
                    onCheckedChange={(v) => handleToggle(key, v)}
                  />
                </div>
              ))}

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm">Offer terms</Label>
                <Textarea
                  placeholder="e.g., 2-for-1 cocktails 5-7pm, valid Dec 20-24..."
                  value={decision.offer_terms || ''}
                  onChange={e => handleOfferTerms(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Compliance notice */}
            <div className="p-4 rounded-lg border border-warning/20 bg-warning/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  No fake discounts, no invented claims. If offer terms are missing, AI must produce non-specific copy
                  and mark tasks "Needs details".
                </p>
              </div>
            </div>
          </div>
        </div>
    </motion.div>
  );
}
