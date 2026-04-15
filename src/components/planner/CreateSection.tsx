/**
 * CREATE Step — Unified content creation workspace
 * Merges Campaign Pack (copy) + Production (assets) into one creative sandbox.
 * No approval gates — uses a "favorite/preferred" mechanism instead.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Sparkles, Loader2, Copy, Check, Star, Image, Video, Plus,
  ExternalLink, Unlink, Link2, Package, FileText, Pencil,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVenue } from '@/lib/venue-context';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { usePulseBrain, buildStrategyContext } from '@/hooks/use-pulse-brain';
import { usePlanWorkspace, OUTPUT_TYPE_LABELS, OUTPUT_SECTIONS, BRIEF_STATUS_LABELS, PlanAssetBrief, PlanAsset } from '@/hooks/use-plan-workspace';
import { supabase } from '@/integrations/supabase/client';
import { ContentAsset } from '@/hooks/use-content-assets';
import { AssetPickerModal } from './AssetPickerModal';
import { MediaImage } from '@/components/ui/media-image';

interface CreateSectionProps {
  planId: string;
  plan: any;
  brain: any;
  workspace: ReturnType<typeof usePlanWorkspace>;
}

const ASSET_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  created: 'Created',
  approved: '★ Preferred',
  scheduled: 'Scheduled',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  created: 'bg-info/10 text-info',
  approved: 'bg-warning/10 text-warning',
  scheduled: 'bg-accent/10 text-accent',
};

export function CreateSection({ planId, plan, brain, workspace }: CreateSectionProps) {
  const [activeTab, setActiveTab] = useState('copy');

  return (
    <div className="space-y-6">
      {/* Generate campaign pack CTA */}
      <GeneratePackCard planId={planId} plan={plan} brain={brain} workspace={workspace} />

      {workspace.hasCampaignPack || workspace.briefs.length > 0 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/30 border border-border/50">
            <TabsTrigger value="copy" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
              <FileText className="w-3.5 h-3.5" /> Copy
              {workspace.outputs.length > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-1">{workspace.outputs.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-2 data-[state=active]:bg-card data-[state=active]:text-foreground">
              <Image className="w-3.5 h-3.5" /> Assets
              {workspace.assets.filter(a => a.content_asset_id).length > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-1">{workspace.assets.filter(a => a.content_asset_id).length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="copy">
            <CopyWorkspace workspace={workspace} />
          </TabsContent>

          <TabsContent value="assets">
            <AssetsWorkspace planId={planId} plan={plan} workspace={workspace} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-8 h-8 mx-auto opacity-40 mb-2" />
          <p className="text-sm">No content generated yet.</p>
          <p className="text-xs mt-1">Hit "Generate Content" above to create copy and asset briefs for your campaign.</p>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   GENERATE PACK CARD
   ────────────────────────────────────────────── */
function GeneratePackCard({ planId, plan, brain, workspace }: CreateSectionProps) {
  const { currentVenue } = useVenue();
  const { user } = useAuth();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

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

      if (data.persisted) {
        toast({
          title: 'Content generated!',
          description: `${data.persisted.outputs} copy outputs and ${data.persisted.briefs} creative briefs created.`,
        });
      } else {
        toast({ title: 'Content generated!', description: 'Copy and creative briefs saved to your plan.' });
      }
      await workspace.fetchWorkspace();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err.message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-card to-card/60 p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent/15">
          <Sparkles className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Create campaign assets</h3>
          <p className="text-xs text-muted-foreground">
            This is your production workspace for this plan: generate copy, briefs, and campaign-ready assets in one place.
          </p>
        </div>
        <Button onClick={handleGeneratePack} disabled={generating} size="sm" className="gap-2 shrink-0">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? 'Generating...' : workspace.hasCampaignPack ? 'Regenerate' : 'Generate Content'}
        </Button>
      </div>

      {(plan.decision?.offer_terms || plan.decision?.campaign_angle) && (
        <div className="rounded-lg bg-muted/20 border border-border/40 p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">From your Plan</p>
          {plan.decision?.campaign_angle && <p className="text-xs text-foreground">Angle: {plan.decision.campaign_angle}</p>}
          {plan.decision?.offer_terms && <p className="text-xs text-foreground">Offer: {plan.decision.offer_terms}</p>}
          {plan.decision?.target_audience && <p className="text-xs text-foreground">Audience: {plan.decision.target_audience}</p>}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   COPY WORKSPACE — Inline-editable outputs with favorites
   ────────────────────────────────────────────── */
function CopyWorkspace({ workspace }: { workspace: ReturnType<typeof usePlanWorkspace> }) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleFavorite = (outputId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'approved' ? 'draft' : 'approved';
    workspace.updateOutputStatus(outputId, newStatus);
  };

  const coreCopy = workspace.outputs.filter(o => OUTPUT_SECTIONS.core_copy.includes(o.output_type));
  const emailCopy = workspace.outputs.filter(o => OUTPUT_SECTIONS.email.includes(o.output_type));
  const visualCopy = workspace.outputs.filter(o => OUTPUT_SECTIONS.visual.includes(o.output_type));
  const otherCopy = workspace.outputs.filter(o =>
    !OUTPUT_SECTIONS.core_copy.includes(o.output_type) &&
    !OUTPUT_SECTIONS.email.includes(o.output_type) &&
    !OUTPUT_SECTIONS.visual.includes(o.output_type)
  );

  if (workspace.outputs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="w-6 h-6 mx-auto opacity-40 mb-2" />
        <p className="text-sm">No copy generated yet.</p>
        <p className="text-xs mt-1">Generate content above to get captions, hooks, and more.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Edit any text inline. Star your preferred versions — Pulse will use starred items first when building Post Packs.
      </p>
      {coreCopy.length > 0 && <CopySection title="Social Copy" outputs={coreCopy} copied={copied} onCopy={handleCopy} onToggleFavorite={toggleFavorite} onUpdateContent={workspace.updateOutputContent} />}
      {emailCopy.length > 0 && <CopySection title="Email" outputs={emailCopy} copied={copied} onCopy={handleCopy} onToggleFavorite={toggleFavorite} onUpdateContent={workspace.updateOutputContent} />}
      {visualCopy.length > 0 && <CopySection title="Visual Direction" outputs={visualCopy} copied={copied} onCopy={handleCopy} onToggleFavorite={toggleFavorite} onUpdateContent={workspace.updateOutputContent} />}
      {otherCopy.length > 0 && <CopySection title="Other" outputs={otherCopy} copied={copied} onCopy={handleCopy} onToggleFavorite={toggleFavorite} onUpdateContent={workspace.updateOutputContent} />}
    </div>
  );
}

function CopySection({ title, outputs, copied, onCopy, onToggleFavorite, onUpdateContent }: {
  title: string;
  outputs: Array<{ id: string; output_type: string; title: string; content: string; status: string }>;
  copied: string | null;
  onCopy: (text: string, id: string) => void;
  onToggleFavorite: (id: string, status: string) => void;
  onUpdateContent: (id: string, content: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="grid gap-3">
        {outputs.map(output => (
          <EditableOutputCard
            key={output.id}
            output={output}
            copied={copied}
            onCopy={onCopy}
            onToggleFavorite={onToggleFavorite}
            onUpdateContent={onUpdateContent}
          />
        ))}
      </div>
    </div>
  );
}

function EditableOutputCard({ output, copied, onCopy, onToggleFavorite, onUpdateContent }: {
  output: { id: string; output_type: string; title: string; content: string; status: string };
  copied: string | null;
  onCopy: (text: string, id: string) => void;
  onToggleFavorite: (id: string, status: string) => void;
  onUpdateContent: (id: string, content: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(output.content);
  const isFavorite = output.status === 'approved';

  const handleSaveEdit = () => {
    if (editValue.trim() !== output.content) {
      onUpdateContent(output.id, editValue.trim());
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(output.content);
    setEditing(false);
  };

  return (
    <div className={`p-4 rounded-lg border transition-colors group ${
      isFavorite ? 'border-warning/30 bg-warning/5' : 'border-border/50 bg-muted/20 hover:border-border'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {OUTPUT_TYPE_LABELS[output.output_type] || output.title}
          </Badge>
          {isFavorite && (
            <Badge className="text-[10px] bg-warning/15 text-warning border-0">★ Preferred</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${isFavorite ? 'text-warning' : 'text-muted-foreground opacity-0 group-hover:opacity-100'}`}
            onClick={() => onToggleFavorite(output.id, output.status)}
            title={isFavorite ? 'Remove from preferred' : 'Mark as preferred'}
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-warning' : ''}`} />
          </Button>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground opacity-0 group-hover:opacity-100"
              onClick={() => { setEditValue(output.content); setEditing(true); }}
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground opacity-0 group-hover:opacity-100"
            onClick={() => onCopy(output.content, output.id)}
          >
            {copied === output.id ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            rows={4}
            className="text-sm"
            autoFocus
          />
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-7 text-xs">Cancel</Button>
            <Button size="sm" onClick={handleSaveEdit} className="h-7 text-xs">Save</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{output.content}</p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   ASSETS WORKSPACE — Briefs + linked assets with favorites
   ────────────────────────────────────────────── */
function AssetsWorkspace({ planId, plan, workspace }: { planId: string; plan: any; workspace: ReturnType<typeof usePlanWorkspace> }) {
  const navigate = useNavigate();
  const [linkedAssetData, setLinkedAssetData] = useState<Record<string, any>>({});
  const [pickerBriefId, setPickerBriefId] = useState<string | null>(null);
  const [pickerAssetType, setPickerAssetType] = useState<'image' | 'video' | undefined>(undefined);

  useEffect(() => {
    const assetIds = workspace.assets
      .map(a => a.content_asset_id)
      .filter((id): id is string => !!id);

    if (assetIds.length === 0) {
      setLinkedAssetData({});
      return;
    }

    (async () => {
      const { data } = await supabase
        .from('content_assets')
        .select('id, title, asset_type, status, thumbnail_url, public_url, storage_path, storage_bucket, created_at')
        .in('id', assetIds);
      if (data) {
        const map: Record<string, any> = {};
        for (const a of data) {
          const isSignedUrl = (url?: string | null) =>
            url?.includes('/object/sign/') || url?.includes('?token=');
          let resolvedUrl = '';
          if (a.thumbnail_url && !isSignedUrl(a.thumbnail_url)) resolvedUrl = a.thumbnail_url;
          else if (a.public_url && !isSignedUrl(a.public_url)) resolvedUrl = a.public_url;
          if (!resolvedUrl && a.storage_path) {
            const { data: signed } = await supabase.storage.from(a.storage_bucket || 'venue-assets').createSignedUrl(a.storage_path, 3600);
            resolvedUrl = signed?.signedUrl || '';
          }
          map[a.id] = { ...a, _resolvedUrl: resolvedUrl };
        }
        setLinkedAssetData(map);
      }
    })();
  }, [workspace.assets]);

  const handleCreateInStudio = (brief: PlanAssetBrief) => {
    const route = brief.asset_type === 'reel' || brief.asset_type === 'video'
      ? '/studio/reel-creator'
      : '/studio/pro-photo';
    const params = new URLSearchParams({
      plan_id: planId,
      brief_id: brief.id,
      brief_title: brief.title,
      asset_type: brief.asset_type,
    });
    if (brief.intended_channel) params.set('channel', brief.intended_channel);
    navigate(`${route}?${params.toString()}`);
  };

  const handleAttachExisting = (briefId: string, assetType: string) => {
    setPickerBriefId(briefId);
    setPickerAssetType(assetType === 'reel' || assetType === 'video' ? 'video' : 'image');
  };

  const handleAssetSelected = async (asset: ContentAsset) => {
    if (pickerBriefId) {
      await workspace.linkAssetToBrief(pickerBriefId, asset.id, asset.asset_type);
    } else {
      await workspace.linkAssetToPlan(asset.id, asset.asset_type);
    }
    setPickerBriefId(null);
  };

  const handleToggleFavorite = async (planAsset: PlanAsset) => {
    const newStatus = planAsset.status === 'approved' ? 'created' : 'approved';
    const { error } = await supabase
      .from('plan_assets')
      .update({ status: newStatus })
      .eq('id', planAsset.id);
    if (!error) workspace.fetchWorkspace();
  };

  const getRouteForAsset = (assetType: string) =>
    assetType === 'reel' || assetType === 'video' ? '/studio/reel-creator' : '/studio/pro-photo';

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Build assets in context for this plan. Create in Studio or attach existing assets, then star preferred options for Post Packs.
      </p>

      {/* Creative Briefs */}
      {workspace.briefs.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Creative Briefs</h3>
            <Badge variant="secondary" className="text-xs">{workspace.briefs.length} briefs</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workspace.briefs.map(brief => {
              const linkedPlanAsset = workspace.assets.find(a => a.asset_brief_id === brief.id);
              const realAsset = linkedPlanAsset?.content_asset_id
                ? linkedAssetData[linkedPlanAsset.content_asset_id]
                : null;
              return (
                <AssetBriefCard
                  key={brief.id}
                  brief={brief}
                  linkedPlanAsset={linkedPlanAsset || null}
                  realAsset={realAsset}
                  onCreateInStudio={() => handleCreateInStudio(brief)}
                  onAttachExisting={() => handleAttachExisting(brief.id, brief.asset_type)}
                  onOpenAsset={() => realAsset && navigate(getRouteForAsset(realAsset.asset_type))}
                  onToggleFavorite={() => linkedPlanAsset && handleToggleFavorite(linkedPlanAsset)}
                  onDetach={() => linkedPlanAsset && workspace.detachAsset(linkedPlanAsset.id)}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Image className="w-6 h-6 mx-auto opacity-40 mb-2" />
          <p className="text-sm">No creative briefs yet.</p>
          <p className="text-xs mt-1">Generate content to get asset briefs automatically.</p>
        </div>
      )}

      {/* Additional linked assets */}
      {workspace.assets.filter(a => !a.asset_brief_id && a.content_asset_id).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Additional Assets</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {workspace.assets
              .filter(a => !a.asset_brief_id && a.content_asset_id)
              .map(pa => {
                const real = pa.content_asset_id ? linkedAssetData[pa.content_asset_id] : null;
                const isFav = pa.status === 'approved';
                return (
                  <div key={pa.id} className={`rounded-lg border p-3 flex items-center gap-3 ${isFav ? 'border-warning/30 bg-warning/5' : 'border-border/50 bg-card/60'}`}>
                    {real?._resolvedUrl && (
                      <MediaImage src={real._resolvedUrl} alt="" aspectClassName="w-10 h-10" className="rounded object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{real?.title || pa.asset_type}</p>
                      <Badge className={`text-[10px] border-0 ${STATUS_COLORS[pa.status] || ''}`}>
                        {ASSET_STATUS_LABELS[pa.status] || pa.status}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className={`h-7 w-7 ${isFav ? 'text-warning' : 'text-muted-foreground'}`} onClick={() => handleToggleFavorite(pa)}>
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-warning' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => workspace.detachAsset(pa.id)}>
                      <Unlink className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => { setPickerBriefId(null); setPickerAssetType(undefined); }}
      >
        <Link2 className="w-3 h-3" /> Attach Asset to Plan
      </Button>

      <AssetPickerModal
        open={pickerBriefId !== null || pickerAssetType !== undefined}
        onClose={() => { setPickerBriefId(null); setPickerAssetType(undefined); }}
        onSelect={handleAssetSelected}
        assetType={pickerAssetType}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────
   ASSET BRIEF CARD — with favorite instead of approve
   ────────────────────────────────────────────── */
function AssetBriefCard({
  brief,
  linkedPlanAsset,
  realAsset,
  onCreateInStudio,
  onAttachExisting,
  onOpenAsset,
  onToggleFavorite,
  onDetach,
}: {
  brief: PlanAssetBrief;
  linkedPlanAsset: PlanAsset | null;
  realAsset: any;
  onCreateInStudio: () => void;
  onAttachExisting: () => void;
  onOpenAsset: () => void;
  onToggleFavorite: () => void;
  onDetach: () => void;
}) {
  const hasAsset = !!realAsset;
  const isFavorite = linkedPlanAsset?.status === 'approved';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {brief.asset_type === 'reel' || brief.asset_type === 'video' ? (
            <Video className="w-4 h-4 text-accent shrink-0" />
          ) : (
            <Image className="w-4 h-4 text-accent shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{brief.title}</span>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0 whitespace-nowrap">
          {hasAsset ? (isFavorite ? '★ Preferred' : 'Created') : BRIEF_STATUS_LABELS[brief.status] || brief.status}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-3">{brief.brief}</p>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {brief.intended_channel && (
          <Badge variant="secondary" className="text-[10px]">{brief.intended_channel}</Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">{brief.asset_type}</Badge>
      </div>

      {hasAsset ? (
        <div className={`rounded-lg border p-3 space-y-2 ${isFavorite ? 'border-warning/30 bg-warning/5' : 'border-border/50 bg-muted/20'}`}>
          <div className="flex items-center gap-3">
            {realAsset._resolvedUrl && (
              <MediaImage
                src={realAsset._resolvedUrl}
                alt={realAsset.title || ''}
                aspectClassName="w-14 h-14"
                className="rounded-lg object-cover border border-border/50"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{realAsset.title || `${realAsset.asset_type} asset`}</p>
              <p className="text-[10px] text-muted-foreground">
                {realAsset.asset_type} • {format(new Date(realAsset.created_at), 'MMM d, yyyy')}
              </p>
              <Badge className={`text-[10px] border-0 mt-1 ${STATUS_COLORS[linkedPlanAsset?.status || 'created'] || ''}`}>
                {ASSET_STATUS_LABELS[linkedPlanAsset?.status || 'created'] || linkedPlanAsset?.status}
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 w-full">
            <Button size="sm" variant="outline" className="w-full min-w-0 text-xs gap-1 h-8" onClick={onOpenAsset}>
              <ExternalLink className="w-3 h-3 shrink-0" /> Open
            </Button>
            <Button
              size="sm"
              variant={isFavorite ? 'secondary' : 'default'}
              className={`w-full min-w-0 text-xs gap-1 h-8 ${isFavorite ? 'text-warning' : ''}`}
              onClick={onToggleFavorite}
            >
              <Star className={`w-3 h-3 shrink-0 ${isFavorite ? 'fill-warning' : ''}`} />
              {isFavorite ? 'Starred' : 'Star'}
            </Button>
            <Button size="sm" variant="ghost" className="text-xs gap-1 text-muted-foreground h-8 w-8 p-0" onClick={onDetach}>
              <Unlink className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 w-full">
          <Button size="sm" variant="default" className="w-full min-w-0 text-xs gap-1.5 h-8" onClick={onCreateInStudio}>
            <Plus className="w-3 h-3 shrink-0" /> Create in Studio
          </Button>
          <Button size="sm" variant="outline" className="w-full min-w-0 text-xs gap-1.5 h-8" onClick={onAttachExisting}>
            <Link2 className="w-3 h-3 shrink-0" /> Attach Existing
          </Button>
        </div>
      )}
    </div>
  );
}
