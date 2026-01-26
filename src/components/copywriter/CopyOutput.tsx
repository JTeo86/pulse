import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Download, Minus, Crown, Zap, Smile, Clock, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface Variation {
  title: string | null;
  content: string;
}

interface CopyOutputProps {
  variations: Variation[];
  selectedIndex: number;
  onSelectVariation: (index: number) => void;
  onRefine: (refinement: string) => void;
  onUpdateVariation: (index: number, field: 'title' | 'content', value: string) => void;
  isRefining: boolean;
}

const refinements = [
  { id: 'shorter', label: 'Shorter', icon: Minus },
  { id: 'more_premium', label: 'More Premium', icon: Crown },
  { id: 'more_direct', label: 'More Direct', icon: Zap },
  { id: 'more_playful', label: 'More Playful', icon: Smile },
  { id: 'add_urgency', label: 'Add Urgency', icon: Clock },
];

export function CopyOutput({
  variations,
  selectedIndex,
  onSelectVariation,
  onRefine,
  onUpdateVariation,
  isRefining,
}: CopyOutputProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const currentVariation = variations[selectedIndex];

  const handleCopy = async () => {
    const text = currentVariation.title 
      ? `${currentVariation.title}\n\n${currentVariation.content}`
      : currentVariation.content;
    
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const text = currentVariation.title 
      ? `${currentVariation.title}\n\n${currentVariation.content}`
      : currentVariation.content;
    
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `copy-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported as Markdown' });
  };

  if (variations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No variations generated yet
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      {/* Variation Selector */}
      <div className="flex gap-2">
        {variations.map((_, index) => (
          <Button
            key={index}
            variant={selectedIndex === index ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelectVariation(index)}
            className={selectedIndex === index ? 'bg-accent text-accent-foreground' : ''}
          >
            Variation {index + 1}
          </Button>
        ))}
      </div>

      {/* Current Variation Editor */}
      <div className="space-y-4">
        {currentVariation.title !== null && (
          <div>
            <label className="text-sm font-medium text-muted-foreground">Title / Subject</label>
            <Input
              value={currentVariation.title || ''}
              onChange={(e) => onUpdateVariation(selectedIndex, 'title', e.target.value)}
              className="mt-1.5 font-medium"
            />
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-muted-foreground">Content</label>
          <Textarea
            value={currentVariation.content}
            onChange={(e) => onUpdateVariation(selectedIndex, 'content', e.target.value)}
            className="mt-1.5 min-h-[200px]"
          />
        </div>
      </div>

      {/* Quick Refinements */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Quick Refinements</label>
        <div className="flex flex-wrap gap-2">
          {refinements.map((refinement) => (
            <Button
              key={refinement.id}
              variant="outline"
              size="sm"
              onClick={() => onRefine(refinement.id)}
              disabled={isRefining}
              className="gap-1.5"
            >
              {isRefining ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <refinement.icon className="h-3 w-3" />
              )}
              {refinement.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleCopy} className="gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>
    </motion.div>
  );
}
