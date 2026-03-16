import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Sparkles, CheckCircle2, Circle, Plus, Trash2,
  AlertTriangle, Copy, Check, Loader2, FileText, Image, Calendar,
  Lightbulb, Pencil, Package, Play, TrendingUp, ArrowRight, Video,
  RefreshCw, Archive, ExternalLink, Unlink,
} from 'lucide-react';
import { format } from 'date-fns';
import { ProductionSection } from '@/components/planner/ProductionSection';
import { PublishSection } from '@/components/planner/PublishSection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useEventPlanDetail, PLAN_STATUSES } from '@/hooks/use-events';
import { usePlanWorkspace, OUTPUT_TYPE_LABELS, OUTPUT_SECTIONS, BRIEF_STATUS_LABELS, PlanAsset } from '@/hooks/use-plan-workspace';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { usePulseBrain, buildStrategyContext } from '@/hooks/use-pulse-brain';
import { useAutosaveField } from '@/hooks/use-optimistic-mutation';
import { SaveIndicator } from '@/components/ui/save-indicator';
import { supabase } from '@/integrations/supabase/client';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Idea', planned: 'Planned', in_production: 'In Production',
  in_review: 'In Review', approved: 'Approved', scheduled: 'Scheduled',
  done: 'Published', skipped: 'Skipped',
};

/* ══════════════════════════════════════════════════════════
   WORKFLOW STEPS
   ══════════════════════════════════════════════════════════ */
const WORKFLOW_STEPS = [
  { id: 'strategy', label: 'Strategy', icon: Lightbulb },
  { id: 'campaign_pack', label: 'Campaign Pack', icon: Package },
  { id: 'production', label: 'Production', icon: Image },
  { id: 'publish', label: 'Publish', icon: Calendar },
  { id: 'revenue', label: 'Revenue', icon: TrendingUp },
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
    case 'strategy':
      return hasStrategy ? 'done' : 'not_started';
    case 'campaign_pack':
      return hasCampaignPack ? 'done' : hasStrategy ? 'ready' : 'not_started';
    case 'production':
      return hasLinkedAssets ? 'done' : hasAssetBriefs ? 'ready' : 'not_started';
    case 'publish': {
      if ((publishPostedCount || 0) > 0) return 'done';
      if ((publishPackCount || 0) > 0) return 'in_progress';
      if (hasLinkedAssets && hasCampaignPack) return 'ready';
      return 'not_started';
    }
    case 'revenue':
      return 'not_started';
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
  hasApprovedAssets?: boolean,
  hasApprovedOutputs?: boolean,
): { label: string; description: string; target: WorkflowStep } | null {
  const decision = plan?.decision || {};
  const hasStrategy = decision.run_offer || decision.run_event_promo || decision.offer_terms || decision.campaign_angle;

  if (!hasStrategy && activeStep !== 'strategy')
    return { label: 'Complete Strategy', description: 'Define your campaign objectives and offer terms.', target: 'strategy' };
  if (!hasCampaignPack && activeStep !== 'campaign_pack')
    return { label: 'Generate Campaign Pack', description: 'Auto-generate copy and creative direction for all channels.', target: 'campaign_pack' };
  if (!hasLinkedAssets && hasAssetBriefs && activeStep !== 'production')
    return { label: 'Create Assets', description: 'Produce hero images and reels for your campaign.', target: 'production' };
  if ((hasApprovedAssets || hasApprovedOutputs) && (publishPackCount || 0) === 0 && activeStep !== 'publish')
    return { label: 'Create Post Packs', description: 'Assemble ready-to-post packs for Instagram, TikTok, Email and more.', target: 'publish' };
  if ((publishPackCount || 0) > 0 && activeStep !== 'publish')
    return { label: 'Review Post Packs', description: 'Copy captions, download assets, and post when ready.', target: 'publish' };
  return null;
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE — Workflow Shell
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

  const [activeStep, setActiveStep] = useState<WorkflowStep>('strategy');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

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

  const approvedAssets = workspace.assets.filter((a: any) => a.status === 'approved');
  const approvedOutputs = workspace.outputs.filter((o: any) => o.status === 'approved');
  const nextAction = getNextBestAction(activeStep, plan, workspace.hasCampaignPack, workspace.hasAssetBriefs, workspace.hasLinkedAssets, 0, approvedAssets.length > 0, approvedOutputs.length > 0);

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
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-6">
        {/* LEFT — Progress Steps */}
        <div className="space-y-1">
          {WORKFLOW_STEPS.map((step) => {
            const status = getStepStatus(step.id, plan, workspace.hasCampaignPack, workspace.hasAssetBriefs, workspace.hasLinkedAssets, 0, 0);
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm ${
                  isActive
                    ? 'bg-accent/10 text-foreground font-medium border border-accent/20'
                    : 'hover:bg-muted/30 text-muted-foreground'
                }`}
              >
                <div className={`p-1 rounded ${
                  status === 'done' ? 'text-success' :
                  status === 'ready' ? 'text-accent' :
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
        </div>

        {/* MAIN — Active Step Content */}
        <div className="min-w-0">
          {nextAction && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <button
                onClick={() => setActiveStep(nextAction.target)}
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

          {activeStep === 'strategy' && (
            <StrategySection plan={plan} tasks={tasks} brain={brain} updateDecision={updateDecision} toggleTask={toggleTask} addTask={addTask} deleteTask={deleteTask} fetchAll={fetchAll} />
          )}
          {activeStep === 'campaign_pack' && (
            <CampaignPackSection planId={planId!} plan={plan} brain={brain} workspace={workspace} />
          )}
          {activeStep === 'production' && (
            <ProductionSection planId={planId!} plan={plan} workspace={workspace} />
          )}
          {activeStep === 'publish' && (
            <PublishSection planId={planId!} plan={plan} workspace={workspace} />
          )}
          {activeStep === 'revenue' && (
            <RevenueSection plan={plan} brain={brain} />
          )}
        </div>

        {/* RIGHT — Lily Assistant */}
        <div className="space-y-4">
          <LilyPanel plan={plan} brain={brain} activeStep={activeStep} workspace={workspace} />
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   LILY ASSISTANT PANEL
   ═══════════════════════════════════════════════════════ */
function LilyPanel({ plan, brain, activeStep, workspace }: { plan: any; brain: any; activeStep: WorkflowStep; workspace: any }) {
  const insights: string[] = [];

  if (activeStep === 'strategy') {
    if (!plan.decision?.offer_terms)
      insights.push('Campaigns with specific offers typically perform 40% better in hospitality.');
    if (!plan.decision?.target_audience)
      insights.push('Define your target audience to get more relevant copy and creative direction.');
    if (brain.recentPlans.length > 0)
      insights.push(`You have ${brain.recentPlans.length} recent plans. Build on what\'s working.`);
  } else if (activeStep === 'campaign_pack') {
    if (!workspace.hasCampaignPack)
      insights.push('Generate your Campaign Pack to get copy for Instagram, Stories, Reels, Email, and SMS in one click.');
    else
      insights.push(`${workspace.outputs.length} copy outputs ready. Review, edit and approve them for your campaign.`);
  } else if (activeStep === 'production') {
    insights.push('Hero images with food styling and natural light perform best on Instagram.');
    if (workspace.hasAssetBriefs)
      insights.push(`${workspace.briefs.length} creative briefs ready. Click "Create in Studio" to start producing.`);
  } else if (activeStep === 'publish') {
    insights.push('Post Instagram Reels 5-7 days before the event for maximum reach.');
    insights.push('Stories should run daily during the campaign window.');
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
   STRATEGY SECTION
   ═══════════════════════════════════════════════════════ */
function StrategySection({
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
   CAMPAIGN PACK SECTION
   ═══════════════════════════════════════════════════════ */
function CampaignPackSection({ planId, plan, brain, workspace }: {
  planId: string; plan: any; brain: any; workspace: ReturnType<typeof usePlanWorkspace>;
}) {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleGeneratePack = async () => {
    if (!currentVenue || !user) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: {
          venue_id: currentVenue.id,
          module: 'campaign',
          goal: 'campaign_pack',
          inputs: {
            plan_id: planId,
            plan_title: plan.title,
            plan_strategy: plan.decision || {},
            brain_context: buildStrategyContext(brain, plan),
            format: 'campaign_pack',
          },
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Check atomic persistence
      if (data.persisted) {
        toast({
          title: 'Campaign Pack generated!',
          description: `${data.persisted.outputs} outputs and ${data.persisted.briefs} creative briefs saved.`,
        });
      } else {
        toast({ title: 'Campaign Pack generated!', description: 'Copy and creative briefs saved to your plan.' });
      }
      await workspace.fetchWorkspace();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const coreCopy = workspace.outputs.filter(o => OUTPUT_SECTIONS.core_copy.includes(o.output_type));
  const emailCopy = workspace.outputs.filter(o => OUTPUT_SECTIONS.email.includes(o.output_type));
  const visualCopy = workspace.outputs.filter(o => OUTPUT_SECTIONS.visual.includes(o.output_type));
  const otherCopy = workspace.outputs.filter(o =>
    !OUTPUT_SECTIONS.core_copy.includes(o.output_type) &&
    !OUTPUT_SECTIONS.email.includes(o.output_type) &&
    !OUTPUT_SECTIONS.visual.includes(o.output_type)
  );

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-card to-card/60 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/15">
            <Package className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Campaign Pack</h3>
            <p className="text-xs text-muted-foreground">Generate copy for all channels — captions, hooks, headlines, CTAs, email, and SMS.</p>
          </div>
        </div>

        {(plan.decision?.offer_terms || plan.decision?.campaign_angle) && (
          <div className="rounded-lg bg-muted/20 border border-border/40 p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Strategy Context</p>
            {plan.decision?.campaign_angle && <p className="text-xs text-foreground">Angle: {plan.decision.campaign_angle}</p>}
            {plan.decision?.offer_terms && <p className="text-xs text-foreground">Offer: {plan.decision.offer_terms}</p>}
            {plan.decision?.target_audience && <p className="text-xs text-foreground">Audience: {plan.decision.target_audience}</p>}
          </div>
        )}

        <Button onClick={handleGeneratePack} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Generating Campaign Pack...' : workspace.hasCampaignPack ? 'Regenerate Campaign Pack' : 'Generate Campaign Pack'}
        </Button>
      </div>

      {coreCopy.length > 0 && <OutputSection title="Core Campaign Copy" outputs={coreCopy} copied={copied} onCopy={handleCopy} onStatusChange={workspace.updateOutputStatus} />}
      {emailCopy.length > 0 && <OutputSection title="Email Messaging" outputs={emailCopy} copied={copied} onCopy={handleCopy} onStatusChange={workspace.updateOutputStatus} />}
      {visualCopy.length > 0 && <OutputSection title="Visual Direction" outputs={visualCopy} copied={copied} onCopy={handleCopy} onStatusChange={workspace.updateOutputStatus} />}
      {otherCopy.length > 0 && <OutputSection title="Additional Outputs" outputs={otherCopy} copied={copied} onCopy={handleCopy} onStatusChange={workspace.updateOutputStatus} />}

      {!workspace.hasCampaignPack && (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="w-8 h-8 mx-auto opacity-40 mb-2" />
          <p className="text-sm">No campaign pack generated yet.</p>
          <p className="text-xs mt-1">Complete your Strategy, then generate your Campaign Pack above.</p>
        </div>
      )}
    </div>
  );
}

/* Output Section Component */
function OutputSection({ title, outputs, copied, onCopy, onStatusChange }: {
  title: string;
  outputs: Array<{ id: string; output_type: string; title: string; content: string; status: string }>;
  copied: string | null;
  onCopy: (text: string, id: string) => void;
  onStatusChange: (id: string, status: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="grid gap-2">
        {outputs.map(output => (
          <div key={output.id} className="p-4 rounded-lg bg-muted/20 border border-border/50 hover:border-border transition-colors group">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline" className="text-[10px]">
                {OUTPUT_TYPE_LABELS[output.output_type] || output.title}
              </Badge>
              <div className="flex items-center gap-1.5">
                <Select value={output.status} onValueChange={v => onStatusChange(output.id, v)}>
                  <SelectTrigger className="h-6 w-[90px] text-[10px] border-0 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onCopy(output.content, output.id)}
                >
                  {copied === output.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{output.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}




/* ═══════════════════════════════════════════════════════
   REVENUE SECTION
   ═══════════════════════════════════════════════════════ */
function RevenueSection({ plan, brain }: { plan: any; brain: any }) {
  return (
    <div className="space-y-6">
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h3 className="font-medium">Revenue Insights</h3>
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
          <div className="text-center py-8">
            <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No revenue data yet for this campaign.</p>
            <p className="text-xs text-muted-foreground mt-1">Revenue signals will appear here once campaigns are live and tracked.</p>
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
