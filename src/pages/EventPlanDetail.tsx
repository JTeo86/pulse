import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Sparkles, CheckCircle2, Circle, Plus, Trash2,
  AlertTriangle, Loader2, Calendar,
  Lightbulb, Pencil, TrendingUp, ArrowRight,
  PenTool, Send,
} from 'lucide-react';
import { format } from 'date-fns';
import { CreateSection } from '@/components/planner/CreateSection';
import { PublishSection } from '@/components/planner/PublishSection';
import { usePlanPublish } from '@/hooks/use-plan-publish';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useEventPlanDetail, PLAN_STATUSES } from '@/hooks/use-events';
import { usePlanWorkspace, OUTPUT_TYPE_LABELS, OUTPUT_SECTIONS } from '@/hooks/use-plan-workspace';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { usePulseBrain, buildStrategyContext } from '@/hooks/use-pulse-brain';
import { useAutosaveField } from '@/hooks/use-optimistic-mutation';
import { SaveIndicator } from '@/components/ui/save-indicator';
import { supabase } from '@/integrations/supabase/client';
import { useRevenueFeedback, useVenueLearningSignals } from '@/hooks/use-revenue-feedback';
import { RevenueFeedbackCard } from '@/components/planner/RevenueFeedbackCard';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Idea', planned: 'Planned', in_production: 'In Production',
  in_review: 'In Review', approved: 'Approved', scheduled: 'Scheduled',
  done: 'Published', skipped: 'Skipped',
};

/* ══════════════════════════════════════════════════════════
   WORKFLOW STEPS — simplified 3-step model
   ══════════════════════════════════════════════════════════ */
const WORKFLOW_STEPS = [
  { id: 'plan', label: 'Plan', icon: Lightbulb },
  { id: 'create', label: 'Create', icon: PenTool },
  { id: 'post', label: 'Post', icon: Send },
] as const;

type WorkflowStep = typeof WORKFLOW_STEPS[number]['id'];

function getStepStatus(
  step: WorkflowStep,
  plan: any,
  hasCampaignPack: boolean,
  hasAssetBriefs: boolean,
  hasLinkedAssets: boolean,
  publishPackCount?: number,
  publishPostedCount?: number,
): 'not_started' | 'in_progress' | 'ready' | 'done' {
  const decision = plan?.decision || {};
  const hasStrategy = decision.run_offer || decision.run_event_promo || decision.run_menu_highlight ||
    decision.offer_terms || decision.target_audience || decision.campaign_angle;

  switch (step) {
    case 'plan':
      return hasStrategy ? 'done' : 'not_started';
    case 'create':
      if (hasLinkedAssets && hasCampaignPack) return 'done';
      if (hasCampaignPack || hasAssetBriefs) return 'in_progress';
      return hasStrategy ? 'ready' : 'not_started';
    case 'post': {
      const packs = publishPackCount || 0;
      const posted = publishPostedCount || 0;
      if (packs > 0 && posted === packs) return 'done';
      if (packs > 0) return 'in_progress';
      if (hasCampaignPack) return 'ready';
      return 'not_started';
    }
    default:
      return 'not_started';
  }
}

function getNextBestAction(
  activeStep: WorkflowStep,
  plan: any,
  hasCampaignPack: boolean,
  hasAssetBriefs: boolean,
  hasLinkedAssets: boolean,
  publishPackCount?: number,
): { label: string; description: string; target: WorkflowStep } | null {
  const decision = plan?.decision || {};
  const hasStrategy = decision.run_offer || decision.run_event_promo || decision.offer_terms || decision.campaign_angle;

  if (!hasStrategy && activeStep !== 'plan')
    return { label: 'Define your campaign', description: 'Set your objective, audience, and offer to get started.', target: 'plan' };
  if (!hasCampaignPack && hasStrategy && activeStep !== 'create')
    return { label: 'Generate content', description: 'Create copy, captions, and asset briefs for your campaign.', target: 'create' };
  if (hasCampaignPack && (publishPackCount || 0) === 0 && activeStep !== 'post')
    return { label: 'Create Post Packs', description: 'Package your content for Instagram, TikTok, Email and more.', target: 'post' };
  return null;
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE — 3-step Workflow Shell
   ══════════════════════════════════════════════════════════ */
export default function EventPlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const brain = usePulseBrain();

  const {
    plan, tasks, links, loading,
    fetchAll, updateDecision, toggleTask, addTask, deleteTask, updateStatus, updateTitle,
  } = useEventPlanDetail(planId);

  const workspace = usePlanWorkspace(planId);
  const publish = usePlanPublish(planId);
  const { feedback, loading: feedbackLoading, refetch: refetchFeedback } = useRevenueFeedback(planId);
  const { summary: learningSummary } = useVenueLearningSignals(currentVenue?.id);

  const activePacks = publish.items.filter(i => i.status !== 'archived');
  const publishPackCount = activePacks.length;
  const publishPostedCount = activePacks.filter(i => i.status === 'published').length;
  const hasPostedPacks = publishPostedCount > 0;

  const [activeStep, setActiveStep] = useState<WorkflowStep>('plan');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [showRevenue, setShowRevenue] = useState(false);

  useEffect(() => {
    if (plan) setTitleDraft(plan.title);
  }, [plan?.title]);

  if (loading || workspace.loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return <div className="text-center py-20 text-muted-foreground">Plan not found.</div>;
  }

  const handleTitleSave = async () => {
    if (!planId || !titleDraft.trim()) return;
    await updateTitle(titleDraft.trim());
    setEditingTitle(false);
  };

  const nextAction = getNextBestAction(activeStep, plan, workspace.hasCampaignPack, workspace.hasAssetBriefs, workspace.hasLinkedAssets, publishPackCount);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/content/planner">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                  className="text-xl font-serif font-medium h-9"
                  autoFocus
                />
                <Button size="sm" onClick={handleTitleSave}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>Cancel</Button>
              </div>
            ) : (
              <button onClick={() => setEditingTitle(true)} className="flex items-center gap-2 group text-left">
                <h1 className="text-2xl font-serif font-medium truncate">{plan.title}</h1>
                <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            <p className="text-sm text-muted-foreground">
              {format(new Date(plan.starts_at), 'MMMM dd, yyyy')}
              {plan.ends_at && ` — ${format(new Date(plan.ends_at), 'MMMM dd, yyyy')}`}
            </p>
          </div>
        </div>
        <Select value={plan.status} onValueChange={v => updateStatus(v)}>
          <SelectTrigger className="w-[150px] h-9 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAN_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Workflow Shell */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_260px] gap-6">
        {/* LEFT — Progress Steps */}
        <div className="space-y-1">
          {WORKFLOW_STEPS.map((step) => {
            const status = getStepStatus(step.id, plan, workspace.hasCampaignPack, workspace.hasAssetBriefs, workspace.hasLinkedAssets, publishPackCount, publishPostedCount);
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => { setActiveStep(step.id); setShowRevenue(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm ${
                  isActive && !showRevenue
                    ? 'bg-accent/10 text-foreground font-medium border border-accent/20'
                    : 'hover:bg-muted/30 text-muted-foreground'
                }`}
              >
                <div className={`p-1 rounded ${
                  status === 'done' ? 'text-success' :
                  status === 'ready' || status === 'in_progress' ? 'text-accent' :
                  'text-muted-foreground/50'
                }`}>
                  {status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <step.icon className="w-4 h-4" />
                  )}
                </div>
                <span>{step.label}</span>
                {status === 'ready' && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            );
          })}

          <Separator className="my-2" />

          {/* Revenue — secondary */}
          <button
            onClick={() => setShowRevenue(true)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm ${
              showRevenue
                ? 'bg-accent/10 text-foreground font-medium border border-accent/20'
                : 'hover:bg-muted/30 text-muted-foreground'
            }`}
          >
            <div className="p-1 rounded text-muted-foreground/50">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span>Revenue</span>
          </button>
        </div>

        {/* MAIN — Active Step Content */}
        <div className="min-w-0">
          {nextAction && !showRevenue && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <button
                onClick={() => { setActiveStep(nextAction.target); setShowRevenue(false); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 transition-colors text-left group"
              >
                <div className="p-2 rounded-lg bg-accent/15 shrink-0">
                  <ArrowRight className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">Next: {nextAction.label}</p>
                  <p className="text-xs text-muted-foreground">{nextAction.description}</p>
                </div>
              </button>
            </motion.div>
          )}

          {showRevenue ? (
            <RevenueSection plan={plan} brain={brain} planId={planId!} feedback={feedback} hasPostedPacks={hasPostedPacks} onFeedbackSubmitted={refetchFeedback} learningSummary={learningSummary} />
          ) : (
            <>
              {activeStep === 'plan' && (
                <PlanSection plan={plan} tasks={tasks} brain={brain} updateDecision={updateDecision} toggleTask={toggleTask} addTask={addTask} deleteTask={deleteTask} fetchAll={fetchAll} />
              )}
              {activeStep === 'create' && (
                <CreateSection planId={planId!} plan={plan} brain={brain} workspace={workspace} />
              )}
              {activeStep === 'post' && (
                <PublishSection planId={planId!} plan={plan} workspace={workspace} publish={publish} />
              )}
            </>
          )}
        </div>

        {/* RIGHT — Lily Assistant */}
        <div className="space-y-4">
          <LilyPanel plan={plan} brain={brain} activeStep={showRevenue ? 'revenue' : activeStep} workspace={workspace} />
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   LILY ASSISTANT PANEL
   ═══════════════════════════════════════════════════════ */
function LilyPanel({ plan, brain, activeStep, workspace }: { plan: any; brain: any; activeStep: string; workspace: any }) {
  const insights: string[] = [];

  if (activeStep === 'plan') {
    if (!plan.decision?.offer_terms)
      insights.push('Campaigns with specific offers typically perform 40% better in hospitality.');
    if (!plan.decision?.target_audience)
      insights.push('Define your target audience to get more relevant copy and creative direction.');
    if (brain.recentPlans.length > 0)
      insights.push(`You have ${brain.recentPlans.length} recent plans. Build on what's working.`);
  } else if (activeStep === 'create') {
    if (!workspace.hasCampaignPack)
      insights.push('Generate content to get captions, hooks, email copy, and creative briefs in one click.');
    else {
      const starredCopy = workspace.outputs.filter((o: any) => o.status === 'approved').length;
      const starredAssets = workspace.assets.filter((a: any) => a.status === 'approved').length;
      insights.push(`${workspace.outputs.length} copy outputs and ${workspace.briefs.length} asset briefs available.`);
      if (starredCopy > 0 || starredAssets > 0)
        insights.push(`${starredCopy + starredAssets} items starred as preferred — these will be used first in Post Packs.`);
      else
        insights.push('Star your favourite copy and assets — Pulse will use them first when building Post Packs.');
    }
  } else if (activeStep === 'post') {
    insights.push('Post Packs bundle your content into ready-to-post deliverables for each channel.');
    insights.push('Post Instagram Reels 5-7 days before the event for maximum reach.');
    insights.push('TikTok content performs best when posted at peak hours — weekdays 7-9pm.');
  } else if (activeStep === 'revenue') {
    if (brain.revenueInsights.totalSignals > 0)
      insights.push(`${brain.revenueInsights.totalSignals} revenue signals tracked across your campaigns.`);
    else
      insights.push('Revenue tracking will show campaign ROI once your campaigns go live.');
  }

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-medium">Lily</h3>
      </div>
      {insights.map((insight, i) => (
        <p key={i} className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
      ))}
      {insights.length === 0 && (
        <p className="text-xs text-muted-foreground">No suggestions right now. Keep building your campaign!</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PLAN SECTION (was Strategy)
   ═══════════════════════════════════════════════════════ */
function PlanSection({
  plan, tasks, brain, updateDecision, toggleTask, addTask, deleteTask, fetchAll,
}: {
  plan: any; tasks: any[]; brain: any;
  updateDecision: (d: any) => Promise<void>;
  toggleTask: (id: string, done: boolean) => Promise<void>;
  addTask: (title: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  fetchAll: () => Promise<void>;
}) {
  const { currentVenue } = useVenue();
  const { toast } = useToast();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const decision = plan.decision || {};

  const saveField = useCallback(async (key: string, value: string) => {
    await updateDecision({ ...plan.decision, [key]: value });
  }, [plan.decision, updateDecision]);

  const offerTerms = useAutosaveField(decision.offer_terms || '', (v) => saveField('offer_terms', v));
  const audience = useAutosaveField(decision.target_audience || '', (v) => saveField('target_audience', v));
  const angle = useAutosaveField(decision.campaign_angle || '', (v) => saveField('campaign_angle', v));

  const handleToggle = (key: string, val: boolean) => {
    updateDecision({ ...decision, [key]: val });
  };

  const handleGenerate = async () => {
    if (!currentVenue || !plan.id) return;
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
            plan_id: plan.id,
            mode: 'full',
            brain_context: buildStrategyContext(brain, plan),
          }),
        }
      );
      const result = await res.json();
      if (result.success) {
        toast({ title: 'AI strategy generated!', description: 'Tasks and recommendations created.' });
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

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    addTask(newTaskTitle.trim());
    setNewTaskTitle('');
  };

  const rec = plan.ai_recommendation as any;

  return (
    <div className="space-y-6">
      {rec && (
        <div className="card-elevated p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h3 className="font-medium">Lily's Recommendation</h3>
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
        </div>
      )}

      <div className="card-elevated p-5 space-y-4">
        <h3 className="font-medium">Campaign Brief</h3>
        <p className="text-xs text-muted-foreground">What are you promoting? Define the essentials and Pulse will handle the rest.</p>
        {[
          { key: 'run_offer', label: 'Run promotional offer?' },
          { key: 'run_event_promo', label: 'Run event promotion?' },
          { key: 'run_menu_highlight', label: 'Highlight menu item?' },
          { key: 'run_brand_story', label: 'Run brand story?' },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label className="text-sm">{label}</Label>
            <Switch checked={!!decision[key]} onCheckedChange={v => handleToggle(key, v)} />
          </div>
        ))}
        <Separator />
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Target audience</Label>
              <SaveIndicator status={audience.status} />
            </div>
            <Input placeholder="e.g., Date night couples, families, foodies..." value={audience.value} onChange={e => audience.onChange(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Campaign angle</Label>
              <SaveIndicator status={angle.status} />
            </div>
            <Input placeholder="e.g., Seasonal ingredients, indulgence, celebration..." value={angle.value} onChange={e => angle.onChange(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Offer terms</Label>
              <SaveIndicator status={offerTerms.status} />
            </div>
            <Textarea placeholder="e.g., 2-for-1 cocktails 5-7pm..." value={offerTerms.value} onChange={e => offerTerms.onChange(e.target.value)} rows={3} className="text-sm" />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">AI Strategy</h3>
            <p className="text-sm text-muted-foreground">Generate tasks and recommendations using your venue context</p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} size="sm">
            <Sparkles className={`w-4 h-4 mr-2 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'Generating...' : 'Generate Strategy'}
          </Button>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h3 className="font-medium">Checklist</h3>
        <div className="space-y-2">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-3 group">
              <button onClick={() => toggleTask(task.id, !task.is_done)} className="shrink-0">
                {task.is_done ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
              </button>
              <span className={`flex-1 text-sm ${task.is_done ? 'line-through text-muted-foreground' : ''}`}>{task.title}</span>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-7 w-7" onClick={() => deleteTask(task.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Add a task..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTask()} className="flex-1" />
          <Button size="sm" onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="p-4 rounded-lg border border-warning/20 bg-warning/5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">No fake discounts or invented claims. AI will use only the information you provide.</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   REVENUE SECTION (secondary)
   ═══════════════════════════════════════════════════════ */
function RevenueSection({ plan, brain, planId, feedback, hasPostedPacks, onFeedbackSubmitted, learningSummary }: {
  plan: any; brain: any; planId: string;
  feedback: any; hasPostedPacks: boolean;
  onFeedbackSubmitted: () => void;
  learningSummary: any;
}) {
  return (
    <div className="space-y-6">
      {/* One-tap feedback card */}
      <RevenueFeedbackCard
        planId={planId}
        plan={plan}
        feedback={feedback}
        onFeedbackSubmitted={onFeedbackSubmitted}
        hasPostedPacks={hasPostedPacks}
      />

      {/* Learning summary */}
      {(learningSummary.positive_revenue_count > 0 || learningSummary.positive_covers_count > 0 || learningSummary.neutral_count > 0) && (
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            <h3 className="font-medium text-sm">Lily's Learnings</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-success/10 border border-success/15 text-center">
              <p className="text-lg font-semibold text-success">{learningSummary.positive_revenue_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue up</p>
            </div>
            <div className="p-3 rounded-lg bg-info/10 border border-info/15 text-center">
              <p className="text-lg font-semibold text-info">{learningSummary.positive_covers_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Covers up</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
              <p className="text-lg font-semibold text-muted-foreground">{learningSummary.neutral_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Neutral</p>
            </div>
          </div>
          {learningSummary.top_patterns.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Patterns detected</p>
              {learningSummary.top_patterns.map((p: string, i: number) => (
                <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-accent shrink-0" /> {p}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Revenue signals */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h3 className="font-medium text-sm">Revenue Insights</h3>
        </div>
        {brain.revenueInsights.totalSignals > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Tracked Signals</p>
              <p className="text-2xl font-semibold tabular-nums">{brain.revenueInsights.totalSignals}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Estimated Revenue</p>
              <p className="text-2xl font-semibold tabular-nums">£{brain.revenueInsights.estimatedRevenue.toFixed(0)}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <TrendingUp className="w-6 h-6 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">Revenue signals will appear here once campaigns are tracked.</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium">Lily's Insight</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {brain.recentPlans.length > 3
            ? `You've created ${brain.recentPlans.length} plans. Campaigns with clear offers and hero images tend to drive the strongest engagement for ${brain.venue?.name || 'your venue'}.`
            : `Start building your campaign history. After a few campaigns, Lily will provide personalised performance insights.`}
        </p>
      </div>
    </div>
  );
}
