/**
 * Post Pack Suggestion Engine
 * Auto-assembles channel-specific post packs from approved outputs and assets.
 */
import { CHANNEL_COPY_MAP, CHANNEL_ASSET_MAP, PUBLISH_CHANNELS } from '@/hooks/use-plan-publish';

export interface ApprovedOutput {
  id: string;
  output_type: string;
  title: string;
  content: string;
  status: string;
  metadata?: Record<string, any>;
}

export interface ApprovedAsset {
  id: string;
  content_asset_id: string | null;
  asset_type: string;
  status: string;
  asset_brief_id: string | null;
}

export interface SuggestedPostPack {
  channel: string;
  channelLabel: string;
  packType: string;
  title: string;
  suggestedCaption: string;
  suggestedCaptionSource: string | null;
  suggestedAssetId: string | null;
  suggestedPlanAssetId: string | null;
  prefersVideo: boolean;
  reason: string;
}

/**
 * Given available outputs and plan assets, suggest post packs for each channel.
 * Prefers starred/approved items, but works with any available content.
 */
export function generateSuggestedPacks(
  outputs: ApprovedOutput[],
  assets: ApprovedAsset[],
  existingChannels: string[],
): SuggestedPostPack[] {
  const suggestions: SuggestedPostPack[] = [];

  for (const channel of PUBLISH_CHANNELS) {
    if (existingChannels.includes(channel.value)) continue;

    const copyTypes = CHANNEL_COPY_MAP[channel.value] || [];
    const assetTypes = CHANNEL_ASSET_MAP[channel.value] || [];
    const prefersVideo = assetTypes.includes('reel') || assetTypes.includes('video');

    // Find best copy: starred/approved first, then any matching, then fallback
    let bestCaption = '';
    let captionSource: string | null = null;
    for (const copyType of copyTypes) {
      const starred = outputs.find(o => o.output_type === copyType && o.status === 'approved');
      if (starred) { bestCaption = starred.content; captionSource = starred.output_type; break; }
    }
    if (!bestCaption) {
      for (const copyType of copyTypes) {
        const match = outputs.find(o => o.output_type === copyType);
        if (match) { bestCaption = match.content; captionSource = match.output_type; break; }
      }
    }
    if (!bestCaption && outputs.length > 0) {
      const fb = outputs.find(o => o.status === 'approved') || outputs[0];
      bestCaption = fb.content;
      captionSource = fb.output_type;
    }

    // Find best asset: starred first, then any matching, then fallback
    let bestAssetId: string | null = null;
    let bestPlanAssetId: string | null = null;
    for (const assetType of assetTypes) {
      const starred = assets.find(a => a.asset_type === assetType && a.content_asset_id && a.status === 'approved');
      if (starred) { bestAssetId = starred.content_asset_id; bestPlanAssetId = starred.id; break; }
    }
    if (!bestAssetId) {
      for (const assetType of assetTypes) {
        const match = assets.find(a => a.asset_type === assetType && a.content_asset_id);
        if (match) { bestAssetId = match.content_asset_id; bestPlanAssetId = match.id; break; }
      }
    }
    if (!bestAssetId) {
      const fb = assets.find(a => a.content_asset_id && a.status === 'approved') || assets.find(a => a.content_asset_id);
      if (fb) { bestAssetId = fb.content_asset_id; bestPlanAssetId = fb.id; }
    }

    if (!bestCaption && !bestAssetId) continue;

    const packType = channel.category === 'direct' ? 'direct' : 'social';
    let reason = '';
    if (bestCaption && bestAssetId) reason = 'Copy and asset matched';
    else if (bestCaption) reason = 'Copy available';
    else reason = 'Asset available';

    suggestions.push({
      channel: channel.value,
      channelLabel: channel.label,
      packType,
      title: `${channel.label} Post Pack`,
      suggestedCaption: bestCaption,
      suggestedCaptionSource: captionSource,
      suggestedAssetId: bestAssetId,
      suggestedPlanAssetId: bestPlanAssetId,
      prefersVideo,
      reason,
    });
  }

  return suggestions;
}

/** Get channel display config */
export function getChannelConfig(channelValue: string) {
  return PUBLISH_CHANNELS.find(c => c.value === channelValue) || {
    value: channelValue,
    label: channelValue,
    icon: 'send',
    category: 'social' as const,
  };
}
