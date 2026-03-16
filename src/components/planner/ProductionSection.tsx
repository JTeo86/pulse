import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Image, Video, Plus, ExternalLink, Unlink, CheckCircle2, Link2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { usePlanWorkspace, BRIEF_STATUS_LABELS, PlanAssetBrief, PlanAsset } from '@/hooks/use-plan-workspace';
import { ContentAsset } from '@/hooks/use-content-assets';
import { AssetPickerModal } from './AssetPickerModal';

interface ProductionSectionProps {
  planId: string;
  plan: any;
  workspace: ReturnType<typeof usePlanWorkspace>;
}

const ASSET_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  created: 'Created',
  approved: 'Approved',
  scheduled: 'Scheduled',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  created: 'bg-info/10 text-info',
  approved: 'bg-success/10 text-success',
  scheduled: 'bg-accent/10 text-accent',
};

export function ProductionSection({ planId, plan, workspace }: ProductionSectionProps) {
  const navigate = useNavigate();
  const { currentVenue } = useVenue();
  const [linkedAssetData, setLinkedAssetData] = useState<Record<string, any>>({});
  const [pickerBriefId, setPickerBriefId] = useState<string | null>(null);
  const [pickerAssetType, setPickerAssetType] = useState<'image' | 'video' | undefined>(undefined);

  // Fetch real asset metadata for linked assets
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
        .select('id, title, asset_type, status, thumbnail_url, public_url, storage_path, created_at')
        .in('id', assetIds);
      if (data) {
        const map: Record<string, any> = {};
        for (const a of data) {
          const isSignedUrl = (url?: string | null) =>
            url?.includes('/object/sign/') || url?.includes('?token=');
          let resolvedUrl = '';
          if (a.public_url && !isSignedUrl(a.public_url)) {
            resolvedUrl = a.public_url;
          } else if (a.thumbnail_url && !isSignedUrl(a.thumbnail_url)) {
            resolvedUrl = a.thumbnail_url;
          }
          if (!resolvedUrl && a.storage_path) {
            const { data: signed } = await supabase.storage
              .from('venue-assets')
              .createSignedUrl(a.storage_path, 3600);
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
    
    // Pass plan context via URL params so Studio can auto-link on save
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

  const handleApproveAsset = async (planAsset: PlanAsset) => {
    // Update plan_assets status
    const newStatus = planAsset.status === 'approved' ? 'created' : 'approved';
    const { error } = await supabase
      .from('plan_assets')
      .update({ status: newStatus })
      .eq('id', planAsset.id);
    if (!error) {
      workspace.fetchWorkspace();
    }
  };

  const getRouteForAsset = (assetType: string) => {
    if (assetType === 'reel' || assetType === 'video') return '/studio/reel-creator';
    return '/studio/pro-photo';
  };

  return (
    <div className="space-y-6">
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
                <BriefCard
                  key={brief.id}
                  brief={brief}
                  linkedPlanAsset={linkedPlanAsset || null}
                  realAsset={realAsset}
                  onCreateInStudio={() => handleCreateInStudio(brief)}
                  onAttachExisting={() => handleAttachExisting(brief.id, brief.asset_type)}
                  onOpenAsset={() => realAsset && navigate(getRouteForAsset(realAsset.asset_type))}
                  onApprove={() => linkedPlanAsset && handleApproveAsset(linkedPlanAsset)}
                  onDetach={() => linkedPlanAsset && workspace.detachAsset(linkedPlanAsset.id)}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Image className="w-8 h-8 mx-auto opacity-40 mb-2" />
          <p className="text-sm">No creative briefs yet.</p>
          <p className="text-xs mt-1">Generate a Campaign Pack first — asset briefs will be created automatically.</p>
        </div>
      )}

      {/* Directly linked assets (no brief) */}
      {workspace.assets.filter(a => !a.asset_brief_id && a.content_asset_id).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Additional Linked Assets</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {workspace.assets
              .filter(a => !a.asset_brief_id && a.content_asset_id)
              .map(pa => {
                const real = pa.content_asset_id ? linkedAssetData[pa.content_asset_id] : null;
                return (
                  <div key={pa.id} className="rounded-lg border border-border/50 bg-card/60 p-3 flex items-center gap-3">
                    {real?._resolvedUrl && (
                      <img src={real._resolvedUrl} alt="" className="w-10 h-10 rounded object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{real?.title || pa.asset_type}</p>
                      <Badge className={`text-[10px] border-0 ${STATUS_COLORS[pa.status] || ''}`}>
                        {ASSET_STATUS_LABELS[pa.status] || pa.status}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => workspace.detachAsset(pa.id)}>
                      <Unlink className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Attach an asset without a brief */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => {
          setPickerBriefId(null);
          setPickerAssetType(undefined);
        }}
      >
        <Link2 className="w-3 h-3" /> Attach Asset to Plan
      </Button>

      {/* Asset Picker Modal */}
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
   BRIEF CARD
   ────────────────────────────────────────────── */
function BriefCard({
  brief,
  linkedPlanAsset,
  realAsset,
  onCreateInStudio,
  onAttachExisting,
  onOpenAsset,
  onApprove,
  onDetach,
}: {
  brief: PlanAssetBrief;
  linkedPlanAsset: PlanAsset | null;
  realAsset: any;
  onCreateInStudio: () => void;
  onAttachExisting: () => void;
  onOpenAsset: () => void;
  onApprove: () => void;
  onDetach: () => void;
}) {
  const hasAsset = !!realAsset;
  const isApproved = linkedPlanAsset?.status === 'approved';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {brief.asset_type === 'reel' || brief.asset_type === 'video' ? (
            <Video className="w-4 h-4 text-accent" />
          ) : (
            <Image className="w-4 h-4 text-accent" />
          )}
          <span className="text-sm font-medium">{brief.title}</span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {hasAsset ? (isApproved ? '✓ Approved' : 'Asset Created') : BRIEF_STATUS_LABELS[brief.status] || brief.status}
        </Badge>
      </div>

      {/* Brief description */}
      <p className="text-xs text-muted-foreground line-clamp-3">{brief.brief}</p>

      {/* Channel + type */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {brief.intended_channel && (
          <Badge variant="secondary" className="text-[10px]">{brief.intended_channel}</Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">{brief.asset_type}</Badge>
      </div>

      {/* Linked asset */}
      {hasAsset ? (
        <div className={`rounded-lg border p-3 space-y-2 ${isApproved ? 'border-success/30 bg-success/5' : 'border-border/50 bg-muted/20'}`}>
          <div className="flex items-center gap-3">
            {realAsset._resolvedUrl && (
              <img src={realAsset._resolvedUrl} alt={realAsset.title || ''} className="w-14 h-14 rounded-lg object-cover border border-border/50" />
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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={onOpenAsset}>
              <ExternalLink className="w-3 h-3" /> Open
            </Button>
            <Button
              size="sm"
              variant={isApproved ? 'secondary' : 'default'}
              className="flex-1 text-xs gap-1"
              onClick={onApprove}
            >
              <CheckCircle2 className="w-3 h-3" />
              {isApproved ? 'Unapprove' : 'Approve'}
            </Button>
            <Button size="sm" variant="ghost" className="text-xs gap-1 text-muted-foreground" onClick={onDetach}>
              <Unlink className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="default" className="flex-1 text-xs gap-1.5" onClick={onCreateInStudio}>
            <Plus className="w-3 h-3" /> Create in Studio
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs gap-1.5" onClick={onAttachExisting}>
            <Link2 className="w-3 h-3" /> Attach Existing
          </Button>
        </div>
      )}
    </div>
  );
}
