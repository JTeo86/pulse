/**
 * Plan Workspace Hook
 * Manages plan_outputs, plan_asset_briefs, plan_assets
 * with optimistic updates and no full-page refreshes.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PlanOutput {
  id: string;
  plan_id: string;
  output_type: string;
  title: string;
  content: string;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface PlanAssetBrief {
  id: string;
  plan_id: string;
  asset_type: string;
  title: string;
  brief: string;
  intended_channel: string | null;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface PlanAsset {
  id: string;
  plan_id: string;
  asset_brief_id: string | null;
  content_asset_id: string | null;
  asset_type: string;
  status: string;
  created_at: string;
}

// Canonical output type labels
export const OUTPUT_TYPE_LABELS: Record<string, string> = {
  instagram_caption: 'Instagram Caption',
  short_caption: 'Short Caption',
  story_text: 'Story Text',
  reel_hook: 'Reel Hook',
  promo_headline: 'Promotional Headline',
  call_to_action: 'Call to Action',
  sms_push_notification: 'SMS / Push Notification',
  email_subject: 'Email Subject',
  email_preview: 'Email Preview',
  email_body: 'Email Body',
};

// Group outputs into sections
export const OUTPUT_SECTIONS = {
  core_copy: ['instagram_caption', 'short_caption', 'story_text', 'reel_hook', 'promo_headline', 'call_to_action', 'sms_push_notification'],
  email: ['email_subject', 'email_preview', 'email_body'],
};

export const BRIEF_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  brief_ready: 'Brief Ready',
  in_production: 'In Production',
  created: 'Created',
  approved: 'Approved',
  scheduled: 'Scheduled',
};

export function usePlanWorkspace(planId: string | undefined) {
  const { toast } = useToast();
  const [outputs, setOutputs] = useState<PlanOutput[]>([]);
  const [briefs, setBriefs] = useState<PlanAssetBrief[]>([]);
  const [assets, setAssets] = useState<PlanAsset[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchWorkspace = useCallback(async () => {
    if (!planId) return;
    try {
      const [outputsRes, briefsRes, assetsRes] = await Promise.all([
        supabase.from('plan_outputs').select('*').eq('plan_id', planId).order('created_at'),
        supabase.from('plan_asset_briefs').select('*').eq('plan_id', planId).order('created_at'),
        supabase.from('plan_assets').select('*').eq('plan_id', planId).order('created_at'),
      ]);
      setOutputs((outputsRes.data as any[]) || []);
      setBriefs((briefsRes.data as any[]) || []);
      setAssets((assetsRes.data as any[]) || []);
    } catch (err) {
      console.error('Plan workspace fetch error:', err);
    } finally {
      if (!hasFetched.current) {
        hasFetched.current = true;
        setInitialLoading(false);
      }
    }
  }, [planId]);

  useEffect(() => {
    hasFetched.current = false;
    setInitialLoading(true);
    fetchWorkspace();
  }, [fetchWorkspace]);

  // Update output content optimistically
  const updateOutputContent = useCallback(async (outputId: string, content: string) => {
    setOutputs(prev => prev.map(o => o.id === outputId ? { ...o, content } : o));
    const { error } = await supabase
      .from('plan_outputs')
      .update({ content })
      .eq('id', outputId);
    if (error) {
      toast({ variant: 'destructive', title: 'Error saving', description: error.message });
      fetchWorkspace();
    }
  }, [fetchWorkspace, toast]);

  // Update output status optimistically
  const updateOutputStatus = useCallback(async (outputId: string, status: string) => {
    setOutputs(prev => prev.map(o => o.id === outputId ? { ...o, status } : o));
    const { error } = await supabase
      .from('plan_outputs')
      .update({ status })
      .eq('id', outputId);
    if (error) fetchWorkspace();
  }, [fetchWorkspace]);

  // Update brief status
  const updateBriefStatus = useCallback(async (briefId: string, status: string) => {
    setBriefs(prev => prev.map(b => b.id === briefId ? { ...b, status } : b));
    const { error } = await supabase
      .from('plan_asset_briefs')
      .update({ status })
      .eq('id', briefId);
    if (error) fetchWorkspace();
  }, [fetchWorkspace]);

  // Link a content asset to a brief
  const linkAssetToBrief = useCallback(async (briefId: string, contentAssetId: string, assetType: string) => {
    if (!planId) return;
    const temp: PlanAsset = {
      id: crypto.randomUUID(),
      plan_id: planId,
      asset_brief_id: briefId,
      content_asset_id: contentAssetId,
      asset_type: assetType,
      status: 'created',
      created_at: new Date().toISOString(),
    };
    setAssets(prev => [...prev, temp]);

    const { data, error } = await supabase
      .from('plan_assets')
      .insert({
        plan_id: planId,
        asset_brief_id: briefId,
        content_asset_id: contentAssetId,
        asset_type: assetType,
        status: 'created',
      })
      .select()
      .single();

    if (error) {
      setAssets(prev => prev.filter(a => a.id !== temp.id));
      toast({ variant: 'destructive', title: 'Error linking asset', description: error.message });
    } else if (data) {
      setAssets(prev => prev.map(a => a.id === temp.id ? (data as any) : a));
      // Also mark the brief as created
      updateBriefStatus(briefId, 'created');
    }
  }, [planId, toast, updateBriefStatus]);

  const hasCampaignPack = outputs.length > 0;
  const hasAssetBriefs = briefs.length > 0;
  const hasLinkedAssets = assets.filter(a => a.content_asset_id).length > 0;

  return {
    outputs,
    briefs,
    assets,
    loading: initialLoading,
    hasCampaignPack,
    hasAssetBriefs,
    hasLinkedAssets,
    fetchWorkspace,
    updateOutputContent,
    updateOutputStatus,
    updateBriefStatus,
    linkAssetToBrief,
  };
}
