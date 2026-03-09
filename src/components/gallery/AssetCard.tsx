import { useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  Heart,
  Download,
  MoreHorizontal,
  Film,
  Copy,
  History,
  Star,
  Archive,
  Trash2,
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ContentAsset } from '@/hooks/use-content-assets';

interface AssetCardProps {
  asset: ContentAsset;
  onCreateVariation?: (asset: ContentAsset) => void;
  onCreateReel?: (asset: ContentAsset) => void;
  onViewLineage?: (asset: ContentAsset) => void;
  onToggleFavorite?: (asset: ContentAsset) => void;
  onDelete?: (asset: ContentAsset) => void;
  onUpdateStatus?: (asset: ContentAsset, status: string) => void;
  showVariation?: boolean;
  showReel?: boolean;
  showLineage?: boolean;
  isCreatingVariation?: boolean;
  isCreatingReel?: boolean;
  canEdit?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: (asset: ContentAsset) => void;
}

const sourceLabels: Record<string, { label: string; className: string }> = {
  generated_image: { label: 'Generated', className: 'bg-accent/20 text-accent' },
  variation: { label: 'Variation', className: 'bg-info/20 text-info' },
  approved_output: { label: 'Approved', className: 'bg-success/20 text-success' },
  upload: { label: 'Upload', className: 'bg-muted text-muted-foreground' },
  generated_video: { label: 'AI Reel', className: 'bg-accent/20 text-accent' },
  reel_source: { label: 'Reel Source', className: 'bg-warning/20 text-warning' },
};

const statusIcons: Record<string, typeof CheckCircle2> = {
  draft: Clock,
  approved: CheckCircle2,
  scheduled: Send,
  published: Sparkles,
  archived: Archive,
  failed: AlertTriangle,
};

export function AssetCard({
  asset,
  onCreateVariation,
  onCreateReel,
  onViewLineage,
  onToggleFavorite,
  onDelete,
  onUpdateStatus,
  showVariation = true,
  showReel = true,
  showLineage = true,
  isCreatingVariation = false,
  isCreatingReel = false,
  canEdit = true,
  selectionMode = false,
  selected = false,
  onSelect,
}: AssetCardProps) {
  const source = sourceLabels[asset.source_type] || sourceLabels.upload;
  const StatusIcon = statusIcons[asset.status] || Clock;
  const imageUrl = asset._resolvedUrl || asset.public_url || '';

  const handleCardClick = () => {
    if (selectionMode && onSelect) {
      onSelect(asset);
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) return;
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = asset.title || `asset-${asset.id.slice(0, 8)}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="group relative rounded-xl overflow-hidden border border-border bg-card hover:border-accent/30 transition-all duration-300"
    >
      {/* Image */}
      <div className="aspect-square relative overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={asset.title || 'Asset'}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            {asset.asset_type === 'video' ? <Film className="w-8 h-8" /> : <Sparkles className="w-8 h-8" />}
          </div>
        )}

        {/* Top badges — show real generation info */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <Badge variant="outline" className={`text-[10px] ${source.className} border-0`}>
              {asset.source_type === 'variation'
                ? `Variation${(asset.metadata as any)?.variation_label ? ` · ${(asset.metadata as any).variation_label}` : ''}`
                : source.label}
            </Badge>
            {(asset.metadata as any)?.generation_mode && (
              <Badge variant="outline" className="text-[9px] bg-card/80 text-foreground/70 border-0">
                {(asset.metadata as any).generation_mode === 'safe' ? 'Safe' :
                 (asset.metadata as any).generation_mode === 'enhanced' ? 'Enhanced' :
                 (asset.metadata as any).generation_mode === 'editorial' ? 'Editorial' :
                 (asset.metadata as any).generation_mode}
              </Badge>
            )}
          </div>
          {asset.is_favorite && (
            <Heart className="w-4 h-4 text-accent fill-accent" />
          )}
        </div>

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
          <div className="flex gap-1.5">
            {showReel && asset.asset_type === 'image' && (
              <Button
                size="sm"
                className="flex-1 h-7 text-xs gap-1"
                onClick={() => onCreateReel?.(asset)}
                disabled={isCreatingReel}
              >
                {isCreatingReel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                Create Reel
              </Button>
            )}
            {showVariation && asset.asset_type === 'image' && (
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 h-7 text-xs gap-1"
                onClick={() => onCreateVariation?.(asset)}
                disabled={isCreatingVariation}
              >
                {isCreatingVariation ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                Variation
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Card footer */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium truncate flex-1">
            {asset.title || 'Untitled'}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" /> Download
              </DropdownMenuItem>
              {showLineage && (
                <DropdownMenuItem onClick={() => onViewLineage?.(asset)}>
                  <History className="w-4 h-4 mr-2" /> Version History
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onToggleFavorite?.(asset)}>
                <Heart className={`w-4 h-4 mr-2 ${asset.is_favorite ? 'fill-accent text-accent' : ''}`} />
                {asset.is_favorite ? 'Remove Favorite' : 'Mark as Favorite'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpdateStatus?.(asset, asset.status === 'approved' ? 'draft' : 'approved')}>
                <Star className="w-4 h-4 mr-2" />
                {asset.status === 'approved' ? 'Revert to Draft' : 'Approve'}
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onUpdateStatus?.(asset, 'archived')}>
                    <Archive className="w-4 h-4 mr-2" /> Archive
                  </DropdownMenuItem>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this asset and its file. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete?.(asset)} className="bg-destructive hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <StatusIcon className="w-3 h-3" />
          <span className="capitalize">{asset.status}</span>
          <span>•</span>
          <span>{format(new Date(asset.created_at), 'MMM d')}</span>
          {asset.lineage_depth > 0 && (
            <>
              <span>•</span>
              <span>v{asset.lineage_depth + 1}</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
