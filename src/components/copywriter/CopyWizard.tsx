import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { CopyOutput } from './CopyOutput';
import type { CopyModule } from './CopywriterModule';

interface CopyWizardProps {
  module: CopyModule;
  moduleConfig: { title: string; icon: any; color: string };
  onClose: () => void;
  onProjectSaved: () => void;
}

const goals = [
  { id: 'promote_event', label: 'Promote Event', description: 'Drive attendance to an upcoming event' },
  { id: 'new_menu', label: 'New Menu Item', description: 'Announce and promote a new dish or drink' },
  { id: 'seasonal_offer', label: 'Seasonal Offer', description: 'Highlight a limited-time seasonal promotion' },
  { id: 'brand_story', label: 'Brand Story', description: 'Share your story and build connection' },
  { id: 'drive_bookings', label: 'Drive Bookings', description: 'Increase reservations and walk-ins' },
  { id: 'last_minute', label: 'Last-Minute Availability', description: 'Fill empty tables or slots quickly' },
];

const platforms = {
  email: ['Newsletter', 'Promotional Email', 'Welcome Email'],
  blog: ['Website Blog', 'Medium', 'LinkedIn Article'],
  ad_copy: ['Meta (Facebook/Instagram)', 'Google Ads', 'TikTok', 'Twitter/X'],
  sms_push: ['SMS', 'Push Notification', 'WhatsApp'],
};

interface Variation {
  title: string | null;
  content: string;
}

export function CopyWizard({ module, moduleConfig, onClose, onProjectSaved }: CopyWizardProps) {
  const { currentVenue, isAdmin, isDemoMode } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<number>(0);

  // Form state
  const [selectedGoal, setSelectedGoal] = useState('');
  const [keyMessage, setKeyMessage] = useState('');
  const [callToAction, setCallToAction] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [platform, setPlatform] = useState('');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');

  const canProceed = () => {
    if (step === 1) return selectedGoal !== '';
    if (step === 2) return keyMessage.trim() !== '' && callToAction.trim() !== '';
    return true;
  };

  const handleGenerate = async () => {
    if (!currentVenue || !user) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: {
          venue_id: currentVenue.id,
          module,
          goal: selectedGoal,
          inputs: {
            key_message: keyMessage,
            call_to_action: callToAction,
            audience: audience || undefined,
            tone: tone || undefined,
            platform: platform || undefined,
            length,
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setVariations(data.variations);
      setStep(3);
    } catch (error: any) {
      console.error('Generation error:', error);
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: error.message || 'Failed to generate copy. Please try again.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (refinement: string) => {
    if (variations.length === 0) return;

    setIsGenerating(true);
    try {
      const current = variations[selectedVariation];
      const { data, error } = await supabase.functions.invoke('refine-copy', {
        body: {
          content: current.content,
          title: current.title,
          refinement,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Update the selected variation
      const newVariations = [...variations];
      newVariations[selectedVariation] = {
        title: data.title || current.title,
        content: data.content,
      };
      setVariations(newVariations);

      toast({ title: 'Copy refined successfully' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Refinement failed',
        description: error.message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!currentVenue || !user || isDemoMode) {
      if (isDemoMode) {
        toast({
          variant: 'destructive',
          title: 'Demo Mode',
          description: 'Cannot save in demo mode. Create your own brand to save.',
        });
      }
      return;
    }

    try {
      // Create the project
      const { data: project, error: projectError } = await supabase
        .from('copy_projects')
        .insert({
          venue_id: currentVenue.id,
          created_by: user.id,
          module,
          goal: selectedGoal,
          inputs: {
            key_message: keyMessage,
            call_to_action: callToAction,
            audience,
            tone,
            platform,
            length,
          },
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Save all variations as outputs
      const outputs = variations.map((v, index) => ({
        project_id: project.id,
        version: index + 1,
        title: v.title,
        content: v.content,
      }));

      const { error: outputError } = await supabase
        .from('copy_outputs')
        .insert(outputs);

      if (outputError) throw outputError;

      toast({ title: 'Project saved successfully' });
      onProjectSaved();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to save',
        description: error.message,
      });
    }
  };

  const updateVariation = (index: number, field: 'title' | 'content', value: string) => {
    const newVariations = [...variations];
    newVariations[index] = { ...newVariations[index], [field]: value };
    setVariations(newVariations);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <Card className="card-elevated">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <moduleConfig.icon className={`h-5 w-5 ${moduleConfig.color}`} />
                </div>
                <div>
                  <CardTitle>{moduleConfig.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Step {step} of 3 — {step === 1 ? 'Choose Goal' : step === 2 ? 'Add Details' : 'Review & Refine'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Step 1: Goal Selection */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <Label className="text-base font-medium">What's your goal?</Label>
                <RadioGroup value={selectedGoal} onValueChange={setSelectedGoal} className="grid gap-3">
                  {goals.map((goal) => (
                    <div key={goal.id} className="flex items-center space-x-3">
                      <RadioGroupItem value={goal.id} id={goal.id} />
                      <Label htmlFor={goal.id} className="flex-1 cursor-pointer">
                        <span className="font-medium">{goal.label}</span>
                        <span className="text-sm text-muted-foreground ml-2">{goal.description}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </motion.div>
            )}

            {/* Step 2: Inputs */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="keyMessage">Key Message *</Label>
                    <Textarea
                      id="keyMessage"
                      placeholder="e.g., Our new summer menu features locally-sourced ingredients and bold Mediterranean flavors"
                      value={keyMessage}
                      onChange={(e) => setKeyMessage(e.target.value)}
                      className="mt-1.5"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="cta">Call to Action *</Label>
                    <Input
                      id="cta"
                      placeholder="e.g., Book your table today, Try it now, Reserve your spot"
                      value={callToAction}
                      onChange={(e) => setCallToAction(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground mb-4">Optional: Fine-tune your output</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="audience">Target Audience</Label>
                      <Input
                        id="audience"
                        placeholder="e.g., Young professionals, Families"
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>

                    <div>
                      <Label htmlFor="tone">Tone Override</Label>
                      <Select value={tone} onValueChange={setTone}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Use brand default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="casual">Casual & Friendly</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="luxury">Sophisticated & Exclusive</SelectItem>
                          <SelectItem value="playful">Playful & Fun</SelectItem>
                          <SelectItem value="urgent">Urgent & Direct</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="platform">Platform</Label>
                      <Select value={platform} onValueChange={setPlatform}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          {platforms[module].map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="length">Length</Label>
                      <Select value={length} onValueChange={(v) => setLength(v as 'short' | 'medium' | 'long')}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short">Short</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="long">Long</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Output */}
            {step === 3 && (
              <CopyOutput
                variations={variations}
                selectedIndex={selectedVariation}
                onSelectVariation={setSelectedVariation}
                onRefine={handleRefine}
                onUpdateVariation={updateVariation}
                isRefining={isGenerating}
              />
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button
                variant="ghost"
                onClick={() => step > 1 ? setStep(step - 1) : onClose()}
                disabled={isGenerating}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {step === 1 ? 'Cancel' : 'Back'}
              </Button>

              <div className="flex gap-2">
                {step === 3 && (
                  <>
                    <Button variant="outline" onClick={handleSave} disabled={isGenerating || !isAdmin}>
                      Save Project
                    </Button>
                    <Button variant="outline" onClick={() => setStep(2)} disabled={isGenerating}>
                      Edit Inputs
                    </Button>
                  </>
                )}
                
                {step < 3 && (
                  <Button
                    onClick={() => step === 2 ? handleGenerate() : setStep(step + 1)}
                    disabled={!canProceed() || isGenerating}
                    className="btn-accent"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : step === 2 ? (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Copy
                      </>
                    ) : (
                      <>
                        Next
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
