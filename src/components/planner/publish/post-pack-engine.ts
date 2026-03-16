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
 * Given approved outputs and approved plan assets, suggest post packs for each channel.
 */
export function generateSuggestedPacks(
  approvedOutputs: ApprovedOutput[],
  approvedAssets: ApprovedAsset[],
  existingChannels: string[],
): SuggestedPostPack[] {
  const suggestions: SuggestedPostPack[] = [];

  for (const channel of PUBLISH_CHANNELS) {
    // Skip channels that already have a post pack
    if (existingChannels.includes(channel.value)) continue;

    const copyTypes = CHANNEL_COPY_MAP[channel.value] || [];
    const assetTypes = CHANNEL_ASSET_MAP[channel.value] || [];
    const prefersVideo = assetTypes.includes('reel') || assetTypes.includes('video');

    // Find best matching copy
    let bestCaption = '';
    let captionSource: string | null = null;
    for (const copyType of copyTypes) {
      const match = approvedOutputs.find(o => o.output_type === copyType);
      if (match) {
        bestCaption = match.content;
        captionSource = match.output_type;
        break;
      }
    }

    // Fallback: try any approved output
    if (!bestCaption && approvedOutputs.length > 0) {
      const fallback = approvedOutputs[0];
      bestCaption = fallback.content;
      captionSource = fallback.output_type;
    }

    // Find best matching asset
    let bestAssetId: string | null = null;
    let bestPlanAssetId: string | null = null;
    for (const assetType of assetTypes) {
      const match = approvedAssets.find(
        a => a.asset_type === assetType && a.content_asset_id
      );
      if (match) {
        bestAssetId = match.content_asset_id;
        bestPlanAssetId = match.id;
        break;
      }
    }

    // Fallback: any approved asset with content
    if (!bestAssetId && approvedAssets.length > 0) {
      const fallback = approvedAssets.find(a => a.content_asset_id);
      if (fallback) {
        bestAssetId = fallback.content_asset_id;
        bestPlanAssetId = fallback.id;
      }
    }

    // Only suggest if we have at least a caption or an asset
    if (!bestCaption && !bestAssetId) continue;

    const packType = channel.category === 'direct' ? 'direct' : 'social';
    let reason = '';
    if (bestCaption && bestAssetId) {
      reason = 'Approved copy and asset matched';
    } else if (bestCaption) {
      reason = 'Approved copy available';
    } else {
      reason = 'Approved asset available';
    }

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
