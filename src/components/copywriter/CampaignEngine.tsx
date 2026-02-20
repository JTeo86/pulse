import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, Sparkles, X, Calendar, Star, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useEventsCatalog } from '@/hooks/use-events';
import { CampaignKit, type CampaignKitData } from './CampaignKit';
import { type CopyProject } from './RecentDrafts';
import {
  primaryObjectives,
  secondaryFoci,
  type CampaignOpportunity,
} from './campaign-config';
import { format, differenceInDays } from 'date-fns';

interface CampaignEngineProps {
  onProjectSaved: () => void;
  onClose: () => void;
  existingProject?: CopyProject | null;
}

const STEPS = ['Define Objective', 'Select Opportunity', 'Generate Campaign Kit', 'Optimise'];

export function CampaignEngine({ onProjectSaved, onClose, existingProject }: CampaignEngineProps) {
  const { currentVenue, isAdmin, isDemoMode } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const { events, loading: eventsLoading } = useEventsCatalog();

  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimising, setIsOptimising] = useState(false);
  const [kit, setKit] = useState<CampaignKitData | null>(null);

  // Step 1 state
  const [primaryObjective, setPrimaryObjective] = useState('');
  const [secondaryFocus, setSecondaryFocus] = useState<string[]>([]);
  const [keyMessage, setKeyMessage] = useState('');
  const [callToAction, setCallToAction] = useState('');

  // Step 2 state
  const [selectedOpportunity, setSelectedOpportunity] = useState<CampaignOpportunity | null>(null);

  // Build opportunities from events + static options
  const opportunities: CampaignOpportunity[] = [
    ...events.slice(0, 6).map(e => ({
      id: e.id,
      type: 'event' as const,
      label: e.title,
      meta: `${format(new Date(e.starts_at), 'MMM d')} · ${differenceInDays(new Date(e.starts_at), new Date())} days away`,
      startDate: e.starts_at,
    })),
    {
      id: 'seasonal_now',
      type: 'seasonal',
      label: 'Current Season',
      meta: 'Seasonal campaign for right now',
    },
    {
      id: 'general',
      type: 'general',
      label: 'General Campaign',
      meta: 'No specific event — always-on marketing',
    },
  ];

  // Load existing project
  useEffect(() => {
    if (existingProject) {
      const inputs = existingProject.inputs || {};
      setPrimaryObjective(existingProject.goal);
      setKeyMessage(inputs.key_message || '');
      setCallToAction(inputs.call_to_action || '');
      setStep(3);

      // Fetch saved outputs and convert to kit format
      const loadOutputs = async () => {
        const { data } = await supabase
          .from('copy_outputs')
          .select('*')
          .eq('project_id', existingProject.id)
          .order('version');

        if (data && data.length > 0) {
          try {
            const parsed = JSON.parse(data[0].content);
            if (parsed.strategy) {
              setKit(parsed);
            }
          } catch {
            // legacy plain text — leave kit null
          }
        }
      };

      loadOutputs();
    }
  }, [existingProject]);

  const toggleSecondaryFocus = (id: string) => {
    setSecondaryFocus(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const canProceed = () => {
    if (step === 1) return primaryObjective !== '' && keyMessage.trim() !== '' && callToAction.trim() !== '';
    if (step === 2) return true; // opportunity is optional (general allowed)
    return true;
  };

  const handleGenerate = async () => {
    if (!currentVenue || !user) return;
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: {
          venue_id: currentVenue.id,
          module: 'campaign',
          goal: primaryObjective,
          opportunity: selectedOpportunity,
          inputs: {
            key_message: keyMessage,
            call_to_action: callToAction,
            secondary_focus: secondaryFocus,
            opportunity_label: selectedOpportunity?.label || 'General Campaign',
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setKit(data.kit);
      setStep(4);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: err.message || 'Failed to generate campaign kit.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOptimise = async (transformation: string) => {
    if (!kit) return;
    setIsOptimising(true);

    try {
      const { data, error } = await supabase.functions.invoke('refine-copy', {
        body: {
          content: JSON.stringify(kit.assets),
          title: kit.strategy.objective,
          refinement: transformation,
          module: 'campaign',
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Merge updated assets back into kit
      try {
        const updatedAssets = JSON.parse(data.content);
        setKit(prev => prev ? { ...prev, assets: updatedAssets } : prev);
      } catch {
        // If parse fails, leave kit unchanged
      }

      toast({ title: 'Campaign optimised' });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Optimisation failed',
        description: err.message,
      });
    } finally {
      setIsOptimising(false);
    }
  };

  const handleSave = async () => {
    if (!currentVenue || !user || isDemoMode || !kit) return;

    try {
      const { data: project, error: projectError } = await supabase
        .from('copy_projects')
        .insert([{
          venue_id: currentVenue.id,
          created_by: user.id,
          module: 'campaign',
          goal: primaryObjective,
          inputs: {
            key_message: keyMessage,
            call_to_action: callToAction,
            secondary_focus: secondaryFocus,
            opportunity: selectedOpportunity,
          } as any,
        }])
        .select()
        .single();

      if (projectError) throw projectError;

      await supabase.from('copy_outputs').insert({
        project_id: project.id,
        version: 1,
        title: primaryObjectives.find(o => o.id === primaryObjective)?.label || primaryObjective,
        content: JSON.stringify(kit),
      });

      toast({ title: 'Campaign saved' });
      onProjectSaved();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to save', description: err.message });
    }
  };

  const stepLabel = step <= 4 ? STEPS[step - 1] : STEPS[3];

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle className="text-base">Campaign Engine</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div
                      className={`h-1.5 w-6 rounded-full transition-colors ${
                        i + 1 < step ? 'bg-accent' :
                        i + 1 === step ? 'bg-accent/60' :
                        'bg-border'
                      }`}
                    />
                  </div>
                ))}
                <span className="text-xs text-muted-foreground ml-1">Step {Math.min(step, 4)} — {stepLabel}</span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        <AnimatePresence mode="wait">
          {/* Step 1: Define Objective */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-3">
                <Label className="text-sm font-medium">Primary Objective <span className="text-accent">*</span></Label>
                <div className="grid grid-cols-1 gap-2">
                  {primaryObjectives.map((obj) => (
                    <button
                      key={obj.id}
                      onClick={() => setPrimaryObjective(obj.id)}
                      className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all ${
                        primaryObjective === obj.id
                          ? 'border-accent/40 bg-accent/5'
                          : 'border-border/60 hover:border-border bg-transparent'
                      }`}
                    >
                      <div className={`w-4 h-4 mt-0.5 rounded-full border-2 shrink-0 transition-colors ${
                        primaryObjective === obj.id ? 'border-accent bg-accent' : 'border-border'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{obj.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{obj.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Secondary Focus <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {secondaryFoci.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => toggleSecondaryFocus(f.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        secondaryFocus.includes(f.id)
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-border/60 text-muted-foreground hover:border-border'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border pt-5 space-y-4">
                <div>
                  <Label htmlFor="keyMessage">Key Message <span className="text-accent">*</span></Label>
                  <Textarea
                    id="keyMessage"
                    placeholder="What are you promoting? Be specific — avoid invented prices or unverifiable claims."
                    value={keyMessage}
                    onChange={(e) => setKeyMessage(e.target.value)}
                    className="mt-1.5"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="cta">Call to Action <span className="text-accent">*</span></Label>
                  <Input
                    id="cta"
                    placeholder="e.g., Reserve your table, Book now, Discover more"
                    value={callToAction}
                    onChange={(e) => setCallToAction(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Select Opportunity */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <p className="text-sm font-medium text-foreground">Select an Opportunity</p>
                <p className="text-xs text-muted-foreground mt-1">Pulse will use this to shape campaign timing and messaging.</p>
              </div>

              {eventsLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading opportunities…
                </div>
              ) : (
                <div className="space-y-2">
                  {opportunities.map((opp) => {
                    const isSelected = selectedOpportunity?.id === opp.id;
                    const Icon = opp.type === 'event' ? Calendar :
                                opp.type === 'seasonal' ? Star : Layers;
                    return (
                      <button
                        key={opp.id}
                        onClick={() => setSelectedOpportunity(isSelected ? null : opp)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-accent/40 bg-accent/5'
                            : 'border-border/60 hover:border-border bg-transparent'
                        }`}
                      >
                        <div className={`p-1.5 rounded-md transition-colors ${isSelected ? 'bg-accent/20' : 'bg-muted/40'}`}>
                          <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-accent' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{opp.label}</p>
                          {opp.meta && <p className="text-xs text-muted-foreground">{opp.meta}</p>}
                        </div>
                        {opp.type === 'event' && (
                          <Badge variant="outline" className="text-[10px] shrink-0">Event</Badge>
                        )}
                        {opp.type === 'seasonal' && (
                          <Badge variant="outline" className="text-[10px] shrink-0">Seasonal</Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedOpportunity && (
                <div className="rounded-lg bg-muted/20 border border-border/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Selected:</span> {selectedOpportunity.label}
                    {selectedOpportunity.meta && ` — ${selectedOpportunity.meta}`}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Step 3: Generating */}
          {step === 3 && !kit && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {/* Summary before generating */}
              <div className="rounded-xl border border-border/50 bg-muted/10 p-5 space-y-3">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Campaign Brief</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Objective</span>
                    <span className="font-medium text-foreground">
                      {primaryObjectives.find(o => o.id === primaryObjective)?.label || primaryObjective}
                    </span>
                  </div>
                  {secondaryFocus.length > 0 && (
                    <div className="flex items-start justify-between text-sm gap-2">
                      <span className="text-muted-foreground shrink-0">Secondary Focus</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {secondaryFocus.map(f => (
                          <Badge key={f} variant="outline" className="text-[10px]">
                            {secondaryFoci.find(s => s.id === f)?.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Opportunity</span>
                    <span className="text-foreground">{selectedOpportunity?.label || 'General Campaign'}</span>
                  </div>
                  <div className="pt-2 border-t border-border/40">
                    <p className="text-xs text-muted-foreground mb-1">Key Message</p>
                    <p className="text-sm text-foreground">{keyMessage}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2 px-8"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating campaign kit…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Campaign Kit
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Campaign Kit Output */}
          {(step === 4 || (step === 3 && kit)) && kit && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <CampaignKit
                kit={kit}
                onOptimise={handleOptimise}
                isOptimising={isOptimising}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            disabled={isGenerating || isOptimising}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex gap-2">
            {(step === 4 || (step === 3 && kit)) && (
              <>
                {isAdmin && !isDemoMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    disabled={isGenerating || isOptimising}
                  >
                    Save Campaign
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(1)}
                  disabled={isGenerating || isOptimising}
                >
                  New Campaign
                </Button>
              </>
            )}

            {step < 3 && (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed() || isGenerating}
                className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}

            {step === 3 && !kit && !isGenerating && (
              <Button
                onClick={handleGenerate}
                className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Generate
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
