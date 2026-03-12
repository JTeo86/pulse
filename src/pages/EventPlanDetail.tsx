import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Sparkles, CheckCircle2, Circle, Plus, Trash2, ExternalLink,
  AlertTriangle, Copy, Check, Loader2, FileText, Image, Calendar,
  Lightbulb, Pencil, Package, Play, TrendingUp, ArrowRight, Video
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useEventPlanDetail, PLAN_STATUSES } from '@/hooks/use-events';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { usePulseBrain, buildStrategyContext } from '@/hooks/use-pulse-brain';
import { supabase } from '@/integrations/supabase/client';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Idea', planned: 'Planned', in_production: 'In Production',
  in_review: 'In Review', approved: 'Approved', scheduled: 'Scheduled', done: 'Published', skipped: 'Skipped',
};

const COPY_TYPES = [
  { id: 'instagram_caption', label: 'Instagram Caption' },
  { id: 'story_text', label: 'Story Text' },
  { id: 'reel_hook', label: 'Reel Hook' },
  { id: 'promo_headline', label: 'Promotional Headline' },
  { id: 'email_subject', label: 'Email Subject Line' },
  { id: 'call_to_action', label: 'Call to Action' },
];

interface CopyDraft {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  project_id: string;
}

/* ══════════════════════════════════════════════════════════
   NEXT BEST ACTION
   ══════════════════════════════════════════════════════════ */
function getNextBestAction(plan: any, activeSection: string, hasCampaignPack: boolean, hasAssets: boolean): { label: string; description: string; action: string; icon: any } | null {
  const decision = plan?.decision || {};
  const hasStrategy = decision.run_offer || decision.run_event_promo || decision.run_menu_highlight || decision.offer_terms;

  if (!hasStrategy && activeSection !== 'strategy') {
    return { label: 'Complete Strategy', description: 'Define your campaign objectives and offer terms first.', action: 'strategy', icon: Lightbulb };
  }
  if (!hasCampaignPack && activeSection !== 'campaign_pack') {
    return { label: 'Generate Campaign Pack', description: 'Auto-generate copy and creative direction for all channels.', action: 'campaign_pack', icon: Package };
  }
  if (!hasAssets && activeSection !== 'production') {
    return { label: 'Create Assets', description: 'Produce hero images and reels for your campaign.', action: 'production', icon: Image };
  }
  if (plan?.status !== 'scheduled' && plan?.status !== 'done' && activeSection !== 'publish') {
    return { label: 'Schedule & Publish', description: 'Set publishing dates and push to channels.', action: 'publish', icon: Calendar };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════
   PLAN DETAIL PAGE
   ══════════════════════════════════════════════════════════ */
export default function EventPlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { currentVenue, isDemoMode } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const brain = usePulseBrain();
  const { plan, tasks, links, loading, fetchAll, updateDecision, toggleTask, addTask, deleteTask, updateStatus } = useEventPlanDetail(planId);

  const [activeSection, setActiveSection] = useState('strategy');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [hasCampaignPack, setHasCampaignPack] = useState(false);

  useEffect(() => {
    if (plan) setTitleDraft(plan.title);
  }, [plan?.title]);

  // Check if campaign pack exists
  useEffect(() => {
    if (!planId) return;
    const check = async () => {
      const { data } = await supabase
        .from('event_plan_links')
        .select('id')
        .eq('plan_id', planId)
        .eq('kind', 'campaign_pack')
        .limit(1);
      setHasCampaignPack((data?.length || 0) > 0);
    };
    check();
  }, [planId]);

  if (loading) {
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
    await supabase.from('venue_event_plans').update({ title: titleDraft.trim() }).eq('id', planId);
    await fetchAll();
    setEditingTitle(false);
  };

  const hasAssets = links.filter(l => l.content_item_id).length > 0;
  const nextAction = getNextBestAction(plan, activeSection, hasCampaignPack, hasAssets);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
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
        <div className="flex items-center gap-3 shrink-0">
          <Select value={plan.status} onValueChange={v => updateStatus(v)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Next Best Action */}
      {nextAction && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={() => setActiveSection(nextAction.action)}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-accent/20 bg-accent/5 hover:bg-accent/10 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-accent/15 shrink-0">
              <nextAction.icon className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Next step: {nextAction.label}</p>
              <p className="text-xs text-muted-foreground">{nextAction.description}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        </motion.div>
      )}

      {/* Section Tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-6">
        <TabsList className="bg-muted/30 border border-border/50 flex-wrap h-auto gap-0.5 p-1">
          <TabsTrigger value="strategy" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Lightbulb className="w-3.5 h-3.5" /> Strategy
          </TabsTrigger>
          <TabsTrigger value="campaign_pack" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Package className="w-3.5 h-3.5" /> Campaign Pack
          </TabsTrigger>
          <TabsTrigger value="production" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Image className="w-3.5 h-3.5" /> Production
          </TabsTrigger>
          <TabsTrigger value="publish" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Calendar className="w-3.5 h-3.5" /> Publish
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <TrendingUp className="w-3.5 h-3.5" /> Revenue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="strategy">
          <StrategySection
            plan={plan}
            tasks={tasks}
            brain={brain}
            updateDecision={updateDecision}
            toggleTask={toggleTask}
            addTask={addTask}
            deleteTask={deleteTask}
            fetchAll={fetchAll}
          />
        </TabsContent>

        <TabsContent value="campaign_pack">
          <CampaignPackSection
            planId={planId!}
            plan={plan}
            brain={brain}
            onPackGenerated={() => setHasCampaignPack(true)}
          />
        </TabsContent>

        <TabsContent value="production">
          <ProductionSection links={links} plan={plan} />
        </TabsContent>

        <TabsContent value="publish">
          <PublishSection plan={plan} />
        </TabsContent>

        <TabsContent value="revenue">
          <RevenueSection plan={plan} brain={brain} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   STRATEGY SECTION
   ═══════════════════════════════════════════════════════ */
function StrategySection({
  plan, tasks, brain, updateDecision, toggleTask, addTask, deleteTask, fetchAll,
}: {
  plan: any;
  tasks: any[];
  brain: any;
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
  const [localOfferTerms, setLocalOfferTerms] = useState(plan?.decision?.offer_terms || '');
  const [localAudience, setLocalAudience] = useState(plan?.decision?.target_audience || '');
  const [localAngle, setLocalAngle] = useState(plan?.decision?.campaign_angle || '');
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalOfferTerms(plan?.decision?.offer_terms || '');
      setLocalAudience(plan?.decision?.target_audience || '');
      setLocalAngle(plan?.decision?.campaign_angle || '');
    }
  }, [plan?.decision]);

  useEffect(() => {
    if (!isEditingRef.current) return;
    const timer = setTimeout(() => {
      const current = plan?.decision || {};
      updateDecision({
        ...current,
        offer_terms: localOfferTerms,
        target_audience: localAudience,
        campaign_angle: localAngle,
      });
      isEditingRef.current = false;
    }, 800);
    return () => clearTimeout(timer);
  }, [localOfferTerms, localAudience, localAngle]);

  const decision = plan.decision || {};

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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* AI Recommendation */}
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

        {/* Generate Strategy */}
        <div className="card-elevated p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">AI Strategy</h3>
              <p className="text-sm text-muted-foreground">Lily generates tasks and recommendations using your venue context</p>
            </div>
            <Button onClick={handleGenerate} disabled={generating} size="sm">
              <Sparkles className={`w-4 h-4 mr-2 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Generating...' : 'Generate Strategy'}
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
                  {task.is_done ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                </button>
                <span className={`flex-1 text-sm ${task.is_done ? 'line-through text-muted-foreground' : ''}`}>
                  {task.title}
                </span>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-7 w-7" onClick={() => deleteTask(task.id)}>
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
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <div className="card-elevated p-5 space-y-4">
          <h3 className="font-medium">Campaign Brief</h3>

          {/* Objective toggles */}
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
              <Label className="text-xs">Target audience</Label>
              <Input
                placeholder="e.g., Date night couples, families, foodies..."
                value={localAudience}
                onChange={e => { isEditingRef.current = true; setLocalAudience(e.target.value); }}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Campaign angle</Label>
              <Input
                placeholder="e.g., Seasonal ingredients, indulgence, celebration..."
                value={localAngle}
                onChange={e => { isEditingRef.current = true; setLocalAngle(e.target.value); }}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Offer terms</Label>
              <Textarea
                placeholder="e.g., 2-for-1 cocktails 5-7pm..."
                value={localOfferTerms}
                onChange={e => { isEditingRef.current = true; setLocalOfferTerms(e.target.value); }}
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-warning/20 bg-warning/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              No fake discounts or invented claims. AI will use only the information you provide.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   CAMPAIGN PACK SECTION
   ═══════════════════════════════════════════════════════ */
function CampaignPackSection({ planId, plan, brain, onPackGenerated }: {
  planId: string; plan: any; brain: any; onPackGenerated: () => void;
}) {
  const { currentVenue, isDemoMode } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<CopyDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  // Single copy generation
  const [copyType, setCopyType] = useState('instagram_caption');
  const [prompt, setPrompt] = useState('');
  const [singleGenerating, setSingleGenerating] = useState(false);
  const [generatedCopy, setGeneratedCopy] = useState('');

  useEffect(() => {
    const fetchDrafts = async () => {
      setLoadingDrafts(true);
      const { data: linkData } = await supabase
        .from('event_plan_links')
        .select('copy_project_id')
        .eq('plan_id', planId)
        .not('copy_project_id', 'is', null);

      const projectIds = (linkData || []).map(l => l.copy_project_id).filter(Boolean) as string[];
      if (projectIds.length > 0) {
        const { data } = await supabase
          .from('copy_outputs')
          .select('id, title, content, created_at, project_id')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false })
          .limit(30);
        setDrafts((data as CopyDraft[]) || []);
      } else {
        setDrafts([]);
      }
      setLoadingDrafts(false);
    };
    fetchDrafts();
  }, [planId]);

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
            plan_title: plan.title,
            plan_strategy: plan.decision || {},
            brain_context: buildStrategyContext(brain, plan),
            format: 'campaign_pack',
          },
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Save as pack
      if (!isDemoMode) {
        const { data: project } = await supabase
          .from('copy_projects')
          .insert({
            venue_id: currentVenue.id,
            created_by: user.id,
            module: 'campaign',
            goal: 'campaign_pack',
            inputs: { plan_id: planId, plan_title: plan.title } as any,
          })
          .select()
          .single();

        if (project) {
          const kit = data.kit || data;
          const assets = kit?.assets || {};

          // Save individual outputs
          const outputs: { title: string; content: string }[] = [];
          if (assets.social_captions?.length) {
            assets.social_captions.forEach((c: string, i: number) => {
              outputs.push({ title: `Instagram Caption ${i + 1}`, content: c });
            });
          }
          if (assets.short_caption) outputs.push({ title: 'Short Caption', content: assets.short_caption });
          if (assets.story_text) outputs.push({ title: 'Story Text', content: assets.story_text });
          if (assets.reel_hook) outputs.push({ title: 'Reel Hook', content: assets.reel_hook });
          if (assets.promo_headline) outputs.push({ title: 'Promo Headline', content: assets.promo_headline });
          if (assets.email_subject) outputs.push({ title: 'Email Subject', content: assets.email_subject });
          if (assets.call_to_action) outputs.push({ title: 'Call to Action', content: assets.call_to_action });

          // Fallback: store full kit
          if (outputs.length === 0) {
            outputs.push({ title: 'Campaign Pack', content: JSON.stringify(kit, null, 2) });
          }

          for (let i = 0; i < outputs.length; i++) {
            await supabase.from('copy_outputs').insert({
              project_id: project.id,
              version: i + 1,
              title: outputs[i].title,
              content: outputs[i].content,
            });
          }

          await supabase.from('event_plan_links').insert({
            plan_id: planId,
            copy_project_id: project.id,
            kind: 'campaign_pack',
          });

          setDrafts(prev => [
            ...outputs.map((o, i) => ({
              id: crypto.randomUUID(),
              title: o.title,
              content: o.content,
              created_at: new Date().toISOString(),
              project_id: project.id,
            })),
            ...prev,
          ]);
          onPackGenerated();
        }
      }

      toast({ title: 'Campaign Pack generated!', description: 'Copy for all channels has been created.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateSingle = async () => {
    if (!currentVenue || !user || !prompt.trim()) return;
    setSingleGenerating(true);
    setGeneratedCopy('');
    try {
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: {
          venue_id: currentVenue.id,
          module: 'quick_copy',
          goal: copyType,
          inputs: {
            copy_type: COPY_TYPES.find(t => t.id === copyType)?.label,
            key_message: prompt,
            plan_title: plan.title,
            brain_context: buildStrategyContext(brain, plan),
            format: 'single',
          },
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const output = data.kit?.assets?.social_captions?.[0] || data.kit?.assets?.email_body || data.content || JSON.stringify(data.kit?.assets || data, null, 2);
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      setGeneratedCopy(outputStr);

      if (!isDemoMode) {
        const { data: project } = await supabase
          .from('copy_projects')
          .insert({
            venue_id: currentVenue.id,
            created_by: user.id,
            module: 'quick_copy',
            goal: copyType,
            inputs: { key_message: prompt, copy_type: copyType, plan_id: planId } as any,
          })
          .select()
          .single();

        if (project) {
          await supabase.from('copy_outputs').insert({
            project_id: project.id,
            version: 1,
            title: COPY_TYPES.find(t => t.id === copyType)?.label || copyType,
            content: outputStr,
          });
          await supabase.from('event_plan_links').insert({
            plan_id: planId,
            copy_project_id: project.id,
            kind: 'copy',
          });
          setDrafts(prev => [{
            id: crypto.randomUUID(),
            title: COPY_TYPES.find(t => t.id === copyType)?.label || copyType,
            content: outputStr,
            created_at: new Date().toISOString(),
            project_id: project.id,
          }, ...prev]);
        }
      }
      toast({ title: 'Copy generated' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err.message });
    } finally {
      setSingleGenerating(false);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Campaign Pack Generator */}
      <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-card to-card/60 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/15">
            <Package className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Campaign Pack</h3>
            <p className="text-xs text-muted-foreground">
              Generate copy for all channels in one click — captions, hooks, headlines, and CTAs.
            </p>
          </div>
        </div>

        {/* Strategy summary */}
        {(plan.decision?.offer_terms || plan.decision?.campaign_angle) && (
          <div className="rounded-lg bg-muted/20 border border-border/40 p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Strategy Context</p>
            {plan.decision?.campaign_angle && (
              <p className="text-xs text-foreground">Angle: {plan.decision.campaign_angle}</p>
            )}
            {plan.decision?.offer_terms && (
              <p className="text-xs text-foreground">Offer: {plan.decision.offer_terms}</p>
            )}
            {plan.decision?.target_audience && (
              <p className="text-xs text-foreground">Audience: {plan.decision.target_audience}</p>
            )}
          </div>
        )}

        <Button onClick={handleGeneratePack} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Generating Campaign Pack...' : 'Generate Campaign Pack'}
        </Button>
      </div>

      {/* Quick Single Copy */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Quick Copy</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={copyType} onValueChange={setCopyType}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COPY_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">What are you promoting?</Label>
          <Textarea
            placeholder="e.g., New spring tasting menu launching next Friday..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>
        <Button onClick={handleGenerateSingle} disabled={singleGenerating || !prompt.trim()} size="sm" className="gap-2">
          {singleGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {singleGenerating ? 'Generating...' : 'Generate'}
        </Button>
        {generatedCopy && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-accent/20 bg-accent/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">{COPY_TYPES.find(t => t.id === copyType)?.label}</Badge>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => handleCopyText(generatedCopy, 'single')}>
                {copied === 'single' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied === 'single' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{generatedCopy}</p>
          </motion.div>
        )}
      </div>

      {/* Drafts */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="h-4 w-4" />
          Campaign Drafts ({drafts.length})
        </div>
        {loadingDrafts ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Loading...
          </div>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No drafts yet. Generate a Campaign Pack above.</p>
        ) : (
          <div className="grid gap-2">
            {drafts.map(draft => (
              <div key={draft.id} className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:border-border transition-colors group">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="text-[10px]">{draft.title || 'Draft'}</Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{format(new Date(draft.created_at), 'MMM d')}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleCopyText(draft.content, draft.id)}
                    >
                      {copied === draft.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{draft.content?.substring(0, 150)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PRODUCTION SECTION
   ═══════════════════════════════════════════════════════ */
function ProductionSection({ links, plan }: { links: any[]; plan: any }) {
  const navigate = useNavigate();

  const ASSET_BRIEFS = [
    { type: 'Hero Image', channel: 'Instagram Feed', icon: Image, status: 'Not started', description: 'Primary campaign visual for feed posts' },
    { type: 'Reel', channel: 'Instagram Reels / TikTok', icon: Video, status: 'Not started', description: 'Short-form video content (15-30s)' },
    { type: 'Story Visual', channel: 'Instagram Stories', icon: Play, status: 'Not started', description: 'Vertical story format visual' },
  ];

  const contentLinks = links.filter(l => l.content_item_id);

  return (
    <div className="space-y-6">
      {/* Asset Brief Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Recommended Assets</h3>
        <p className="text-xs text-muted-foreground">Create the assets needed for this campaign. Briefs are based on your strategy.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ASSET_BRIEFS.map((brief) => (
            <div key={brief.type} className="card-elevated p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <brief.icon className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium">{brief.type}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">{brief.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{brief.description}</p>
              <p className="text-[10px] text-muted-foreground">Channel: {brief.channel}</p>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5"
                onClick={() => navigate(brief.type === 'Reel' ? '/studio/reel-creator' : '/studio/pro-photo')}
              >
                <Plus className="w-3 h-3" /> Create in Studio
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Linked Assets */}
      {contentLinks.length > 0 && (
        <div className="card-elevated p-5 space-y-4">
          <h3 className="font-medium">Linked Assets</h3>
          <div className="space-y-2">
            {contentLinks.map(link => (
              <div key={link.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{link.kind}</Badge>
                  <span className="text-sm">Content Asset</span>
                </div>
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate('/studio/pro-photo')}>
                  Open <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {contentLinks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Image className="w-8 h-8 mx-auto opacity-40 mb-2" />
          <p className="text-sm">No assets linked yet. Create them above or attach existing assets from your library.</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PUBLISH SECTION
   ═══════════════════════════════════════════════════════ */
function PublishSection({ plan }: { plan: any }) {
  const navigate = useNavigate();

  const channels = [
    { name: 'Instagram Feed', icon: Image, suggested: 'Post 2-3 days before event' },
    { name: 'Instagram Stories', icon: Play, suggested: 'Daily during campaign window' },
    { name: 'Instagram Reels', icon: Video, suggested: 'Publish 5-7 days before event' },
  ];

  return (
    <div className="space-y-6">
      <div className="card-elevated p-5 space-y-4">
        <h3 className="font-medium">Publishing Schedule</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Event Date</p>
            <p className="text-sm font-medium">{format(new Date(plan.starts_at), 'MMMM dd, yyyy')}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Status</p>
            <p className="text-sm font-medium">{STATUS_LABELS[plan.status] || plan.status}</p>
          </div>
        </div>

        {plan.deployed_at && (
          <div className="p-4 rounded-lg bg-success/5 border border-success/20">
            <p className="text-[10px] uppercase tracking-wider text-success font-semibold mb-1">Deployed</p>
            <p className="text-sm">{format(new Date(plan.deployed_at), 'MMMM dd, yyyy HH:mm')}</p>
          </div>
        )}
      </div>

      {/* Channel Suggestions */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Suggested Channel Plan</h3>
        <div className="space-y-2">
          {channels.map(ch => (
            <div key={ch.name} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/60">
              <div className="flex items-center gap-3">
                <ch.icon className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{ch.name}</p>
                  <p className="text-xs text-muted-foreground">{ch.suggested}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">Pending</Badge>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => navigate('/content/scheduler')}
        className="w-full p-5 rounded-xl border border-border/50 bg-card/60 hover:bg-card hover:border-border transition-colors text-left"
      >
        <Calendar className="w-5 h-5 text-accent mb-2" />
        <p className="text-sm font-medium">Open Scheduler</p>
        <p className="text-xs text-muted-foreground mt-1">Schedule content for publishing across channels</p>
      </button>
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

      {/* Lily Insight */}
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium">Lily's Insight</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {brain.recentPlans.length > 3
            ? `You've created ${brain.recentPlans.length} plans. Campaigns with clear offers and hero images tend to drive the strongest engagement for ${brain.venue?.name || 'your venue'}.`
            : `Start building your campaign history. After a few campaigns, Lily will provide personalised performance insights and recommendations.`}
        </p>
      </div>
    </div>
  );
}
