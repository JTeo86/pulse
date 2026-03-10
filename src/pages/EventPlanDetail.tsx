import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Sparkles, CheckCircle2, Circle, Plus, Trash2, ExternalLink,
  AlertTriangle, Copy, Check, Loader2, FileText, Image, Calendar,
  Lightbulb, Pencil
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
import { supabase } from '@/integrations/supabase/client';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Idea', planned: 'Planned', in_production: 'In Production',
  in_review: 'In Review', approved: 'Approved', scheduled: 'Scheduled', done: 'Published', skipped: 'Skipped',
};

/* ────────────────────── Copy Types ────────────────────── */
const COPY_TYPES = [
  { id: 'instagram_caption', label: 'Instagram Caption' },
  { id: 'story_text', label: 'Story Text' },
  { id: 'reel_hook', label: 'Reel Hook' },
  { id: 'promo_headline', label: 'Promotional Headline' },
  { id: 'email_subject', label: 'Email Subject Line' },
  { id: 'event_description', label: 'Event Description' },
  { id: 'call_to_action', label: 'Call to Action' },
  { id: 'sms_push', label: 'SMS / Push Notification' },
];

interface CopyDraft {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  project_id: string;
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
  const { plan, tasks, links, loading, fetchAll, updateDecision, toggleTask, addTask, deleteTask, updateStatus } = useEventPlanDetail(planId);

  const [activeSection, setActiveSection] = useState('strategy');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Sync title for editing
  useEffect(() => {
    if (plan) setTitleDraft(plan.title);
  }, [plan?.title]);

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

  const handleTitleSave = async () => {
    if (!planId || !titleDraft.trim()) return;
    await supabase.from('venue_event_plans').update({ title: titleDraft.trim() }).eq('id', planId);
    await fetchAll();
    setEditingTitle(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* ── Header ── */}
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
              <button
                onClick={() => setEditingTitle(true)}
                className="flex items-center gap-2 group text-left"
              >
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
          <Select value={plan.status} onValueChange={(v) => updateStatus(v)}>
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

      {/* ── Section Tabs ── */}
      <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-6">
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="strategy" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Lightbulb className="w-3.5 h-3.5" /> Strategy
          </TabsTrigger>
          <TabsTrigger value="copy" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <FileText className="w-3.5 h-3.5" /> Copy
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Image className="w-3.5 h-3.5" /> Assets
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5 text-xs data-[state=active]:bg-card data-[state=active]:text-foreground">
            <Calendar className="w-3.5 h-3.5" /> Schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="strategy">
          <StrategySection
            plan={plan}
            tasks={tasks}
            updateDecision={updateDecision}
            toggleTask={toggleTask}
            addTask={addTask}
            deleteTask={deleteTask}
            fetchAll={fetchAll}
          />
        </TabsContent>

        <TabsContent value="copy">
          <CopySection planId={planId!} plan={plan} />
        </TabsContent>

        <TabsContent value="assets">
          <AssetsSection links={links} plan={plan} />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleSection plan={plan} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════
   STRATEGY SECTION
   ═══════════════════════════════════════════════════════ */
function StrategySection({
  plan, tasks, updateDecision, toggleTask, addTask, deleteTask, fetchAll,
}: {
  plan: any;
  tasks: any[];
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
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalOfferTerms(plan?.decision?.offer_terms || '');
    }
  }, [plan?.decision?.offer_terms]);

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
      {/* Main */}
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

        {/* Generate Strategy */}
        <div className="card-elevated p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">AI Strategy</h3>
              <p className="text-sm text-muted-foreground">Generate tasks and a strategic plan using AI</p>
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
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
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
              value={localOfferTerms}
              onChange={e => {
                isEditingRef.current = true;
                setLocalOfferTerms(e.target.value);
              }}
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <div className="p-4 rounded-lg border border-warning/20 bg-warning/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              No fake discounts, no invented claims. If offer terms are missing, AI must produce non-specific copy and mark tasks "Needs details".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COPY SECTION
   ═══════════════════════════════════════════════════════ */
function CopySection({ planId, plan }: { planId: string; plan: any }) {
  const { currentVenue, isDemoMode } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [copyType, setCopyType] = useState('instagram_caption');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCopy, setGeneratedCopy] = useState('');
  const [copied, setCopied] = useState(false);
  const [drafts, setDrafts] = useState<CopyDraft[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);

  // Fetch drafts linked to this plan's copy projects
  useEffect(() => {
    const fetchDrafts = async () => {
      setLoadingDrafts(true);
      // Get copy projects linked to this plan via event_plan_links
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
          .limit(20);
        setDrafts((data as CopyDraft[]) || []);
      } else {
        setDrafts([]);
      }
      setLoadingDrafts(false);
    };
    fetchDrafts();
  }, [planId]);

  const handleGenerate = async () => {
    if (!currentVenue || !user || !prompt.trim()) return;
    setGenerating(true);
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
            format: 'single',
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const output = data.kit?.assets?.social_captions?.[0] ||
                     data.kit?.assets?.email_body ||
                     data.content ||
                     JSON.stringify(data.kit?.assets || data, null, 2);

      const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      setGeneratedCopy(outputStr);

      // Save as draft linked to this plan
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

          // Link copy project to plan
          await supabase.from('event_plan_links').insert({
            plan_id: planId,
            copy_project_id: project.id,
            kind: 'copy',
          });

          // Refresh drafts
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
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Generator */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Generate Copy for This Plan</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Copy Type</Label>
            <Select value={copyType} onValueChange={setCopyType}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COPY_TYPES.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">What are you promoting?</Label>
          <Textarea
            placeholder="e.g., New spring tasting menu launching next Friday..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>

        <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="gap-2" size="sm">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Generating...' : 'Generate Copy'}
        </Button>

        {generatedCopy && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-accent/20 bg-accent/5 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">
                {COPY_TYPES.find(t => t.id === copyType)?.label}
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={handleCopy}>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{generatedCopy}</p>
          </motion.div>
        )}
      </div>

      {/* Drafts for this plan */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="h-4 w-4" />
          Plan Drafts
        </div>

        {loadingDrafts ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Loading drafts...
          </div>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No drafts yet for this plan. Generate some copy above.</p>
        ) : (
          <div className="grid gap-2">
            {drafts.map(draft => (
              <div
                key={draft.id}
                className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="text-[10px]">{draft.title || 'Draft'}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(draft.created_at), 'MMM d')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{draft.content?.substring(0, 120)}...</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ASSETS SECTION
   ═══════════════════════════════════════════════════════ */
function AssetsSection({ links, plan }: { links: any[]; plan: any }) {
  const navigate = useNavigate();

  const contentLinks = links.filter(l => l.content_item_id);
  const copyLinks = links.filter(l => l.copy_project_id);

  return (
    <div className="space-y-6">
      {/* Generated Content */}
      <div className="card-elevated p-5 space-y-4">
        <h3 className="font-medium">Linked Assets</h3>
        {links.length === 0 ? (
          <div className="text-center py-12">
            <Image className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No assets linked yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Generate assets from the Strategy tab or create them in the Studio.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {links.map(link => (
              <div key={link.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{link.kind}</Badge>
                  <span className="text-sm">
                    {link.content_item_id ? 'Content Asset' : 'Copy Project'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => navigate(link.content_item_id ? '/studio/pro-photo' : '#')}
                >
                  Open <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/studio/pro-photo')}
          className="p-5 rounded-xl border border-border/50 bg-card/60 hover:bg-card hover:border-border transition-colors text-left"
        >
          <Image className="w-5 h-5 text-accent mb-2" />
          <p className="text-sm font-medium">Create Pro Photo</p>
          <p className="text-xs text-muted-foreground mt-1">Generate a professional photo in the Studio</p>
        </button>
        <button
          onClick={() => navigate('/studio/reel-creator')}
          className="p-5 rounded-xl border border-border/50 bg-card/60 hover:bg-card hover:border-border transition-colors text-left"
        >
          <FileText className="w-5 h-5 text-accent mb-2" />
          <p className="text-sm font-medium">Create Reel</p>
          <p className="text-xs text-muted-foreground mt-1">Create a short video reel for social</p>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SCHEDULE SECTION
   ═══════════════════════════════════════════════════════ */
function ScheduleSection({ plan }: { plan: any }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="card-elevated p-5 space-y-4">
        <h3 className="font-medium">Publishing Schedule</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Plan Date</p>
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
