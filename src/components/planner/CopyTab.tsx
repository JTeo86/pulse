import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Sparkles, Loader2, Copy, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

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

export function CopyTab() {
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

  // Fetch recent copy outputs
  useEffect(() => {
    if (!currentVenue) return;
    const fetchDrafts = async () => {
      setLoadingDrafts(true);
      const { data } = await supabase
        .from('copy_outputs')
        .select('id, title, content, created_at, project_id')
        .order('created_at', { ascending: false })
        .limit(20);
      setDrafts((data as CopyDraft[]) || []);
      setLoadingDrafts(false);
    };
    fetchDrafts();
  }, [currentVenue]);

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

      setGeneratedCopy(typeof output === 'string' ? output : JSON.stringify(output, null, 2));

      // Save as draft
      if (!isDemoMode) {
        const { data: project } = await supabase
          .from('copy_projects')
          .insert({
            venue_id: currentVenue.id,
            created_by: user.id,
            module: 'quick_copy',
            goal: copyType,
            inputs: { key_message: prompt, copy_type: copyType } as any,
          })
          .select()
          .single();

        if (project) {
          await supabase.from('copy_outputs').insert({
            project_id: project.id,
            version: 1,
            title: COPY_TYPES.find(t => t.id === copyType)?.label || copyType,
            content: typeof output === 'string' ? output : JSON.stringify(output),
          });
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
      {/* Generation form */}
      <div className="rounded-xl border border-border/50 bg-card/60 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Quick Copy Generator</h3>
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
            placeholder="e.g., New spring tasting menu launching next Friday, 5 courses paired with natural wines..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="gap-2"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Generating...' : 'Generate Copy'}
        </Button>

        {/* Output */}
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

      {/* Recent Drafts */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="h-4 w-4" />
          Saved Drafts
        </div>

        {loadingDrafts ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Loading drafts...
          </div>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No drafts yet. Generate some copy above to get started.</p>
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
