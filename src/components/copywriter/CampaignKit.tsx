import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Copy, Check, Download, Loader2,
  Mail, Instagram, MessageSquare, Monitor, Users, Camera,
  ChevronDown, ChevronUp, TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { optimiseTransformations } from './campaign-config';

export interface CampaignKitData {
  strategy: {
    objective: string;
    offerFraming: string;
    ctaPositioning: string;
  };
  assets: {
    email: { subject: string; preview: string; body: string };
    instagram: string;
    sms: string;
    websiteBanner: string;
    staffBriefing: string;
    visualDirection: string;
  };
  contextUsed: string[];
  performanceInsights: string[];
}

interface CampaignKitProps {
  kit: CampaignKitData;
  onOptimise: (transformation: string) => void;
  isOptimising: boolean;
}

const assetSections = [
  { key: 'email', label: 'Email Campaign', icon: Mail, description: 'Subject · Preview · Body' },
  { key: 'instagram', label: 'Instagram Caption', icon: Instagram, description: 'Social post copy' },
  { key: 'sms', label: 'SMS Version', icon: MessageSquare, description: 'Under 160 characters' },
  { key: 'websiteBanner', label: 'Website Banner Copy', icon: Monitor, description: 'Hero or promotional banner' },
  { key: 'staffBriefing', label: 'Staff Briefing', icon: Users, description: 'Internal team summary' },
  { key: 'visualDirection', label: 'Visual Direction', icon: Camera, description: 'Suggested image direction' },
] as const;

function CopyButton({ text }: { text: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function AssetBlock({
  sectionKey,
  label,
  icon: Icon,
  description,
  assets,
}: {
  sectionKey: typeof assetSections[number]['key'];
  label: string;
  icon: any;
  description: string;
  assets: CampaignKitData['assets'];
}) {
  const [expanded, setExpanded] = useState(true);

  const getContent = () => {
    const a = assets;
    if (sectionKey === 'email') {
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Subject Line</p>
            <p className="text-sm font-medium text-foreground">{a.email.subject}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Preview Text</p>
            <p className="text-sm text-muted-foreground">{a.email.preview}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Body</p>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{a.email.body}</p>
          </div>
        </div>
      );
    }
    const textMap: Record<string, string> = {
      instagram: a.instagram,
      sms: a.sms,
      websiteBanner: a.websiteBanner,
      staffBriefing: a.staffBriefing,
      visualDirection: a.visualDirection,
    };
    return (
      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
        {textMap[sectionKey]}
      </p>
    );
  };

  const getFullText = () => {
    if (sectionKey === 'email') {
      return `Subject: ${assets.email.subject}\nPreview: ${assets.email.preview}\n\n${assets.email.body}`;
    }
    const textMap: Record<string, string> = {
      instagram: assets.instagram,
      sms: assets.sms,
      websiteBanner: assets.websiteBanner,
      staffBriefing: assets.staffBriefing,
      visualDirection: assets.visualDirection,
    };
    return textMap[sectionKey] || '';
  };

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-muted/40">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={getFullText()} />
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3">
          {getContent()}
        </div>
      )}
    </div>
  );
}

export function CampaignKit({ kit, onOptimise, isOptimising }: CampaignKitProps) {
  const { toast } = useToast();

  const handleExportAll = () => {
    const a = kit.assets;
    const text = [
      `# Campaign Strategy\n\nObjective: ${kit.strategy.objective}\nOffer Framing: ${kit.strategy.offerFraming}\nCTA Positioning: ${kit.strategy.ctaPositioning}`,
      `\n---\n\n# Email Campaign\n\nSubject: ${a.email.subject}\nPreview: ${a.email.preview}\n\n${a.email.body}`,
      `\n---\n\n# Instagram Caption\n\n${a.instagram}`,
      `\n---\n\n# SMS Version\n\n${a.sms}`,
      `\n---\n\n# Website Banner Copy\n\n${a.websiteBanner}`,
      `\n---\n\n# Staff Briefing\n\n${a.staffBriefing}`,
      `\n---\n\n# Visual Direction\n\n${a.visualDirection}`,
    ].join('\n');

    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `campaign-kit-${Date.now()}.md`;
    el.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Campaign kit exported' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Strategy Summary */}
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-3">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-accent">Campaign Strategy</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Objective</p>
            <p className="text-sm text-foreground font-medium">{kit.strategy.objective}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Offer Framing</p>
            <p className="text-sm text-foreground">{kit.strategy.offerFraming}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">CTA Positioning</p>
            <p className="text-sm text-foreground">{kit.strategy.ctaPositioning}</p>
          </div>
        </div>
      </div>

      {/* Context Used Panel */}
      {kit.contextUsed.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">Context Used for This Campaign</p>
          <div className="flex flex-wrap gap-2">
            {kit.contextUsed.map((ctx, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal text-muted-foreground border-border/50">
                {ctx}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Campaign Assets */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Campaign Assets</p>
        {assetSections.map((section) => (
          <AssetBlock
            key={section.key}
            sectionKey={section.key}
            label={section.label}
            icon={section.icon}
            description={section.description}
            assets={kit.assets}
          />
        ))}
      </div>

      {/* Optimise Controls */}
      <div className="rounded-xl border border-border/60 p-5 space-y-3">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Optimise</p>
        <div className="flex flex-wrap gap-2">
          {optimiseTransformations.map((t) => (
            <Button
              key={t.id}
              variant="outline"
              size="sm"
              onClick={() => onOptimise(t.id)}
              disabled={isOptimising}
              className="text-xs border-border/60 hover:border-accent/40 hover:text-accent transition-colors"
            >
              {isOptimising ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Performance Insight */}
      {kit.performanceInsights.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Why This Campaign Works</p>
          </div>
          <ul className="space-y-1.5">
            {kit.performanceInsights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-accent mt-0.5">·</span>
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Export */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportAll} className="gap-2 text-xs">
          <Download className="h-3.5 w-3.5" />
          Export Full Campaign Kit
        </Button>
      </div>
    </motion.div>
  );
}
