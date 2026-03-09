import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Heart,
  Copy,
  Film,
  Clock,
  Sparkles,
  CheckCircle2,
  GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ContentAsset, useAssetLineage } from '@/hooks/use-content-assets';

interface VersionHistoryPanelProps {
  asset: ContentAsset | null;
  open: boolean;
  onClose: () => void;
  onCreateVariation?: (asset: ContentAsset) => void;
  onCreateReel?: (asset: ContentAsset) => void;
  onToggleFavorite?: (asset: ContentAsset) => void;
}

export function VersionHistoryPanel({
  asset,
  open,
  onClose,
  onCreateVariation,
  onCreateReel,
  onToggleFavorite,
}: VersionHistoryPanelProps) {
  const { data: lineage, isLoading } = useAssetLineage(asset?.id || null);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg border-l border-border bg-card p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-accent" />
              <SheetTitle className="font-serif text-lg">Version History</SheetTitle>
            </div>
          </div>
          {asset && (
            <p className="text-sm text-muted-foreground mt-1">
              {asset.title || 'Untitled'} • {(lineage?.length || 0)} version{(lineage?.length || 0) !== 1 ? 's' : ''}
            </p>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="p-6 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !lineage?.length ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                No version history available.
              </p>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-5 top-6 bottom-6 w-px bg-border" />

                {lineage.map((version, index) => {
                  const isOriginal = version.lineage_depth === 0;
                  const isCurrent = version.id === asset?.id;
                  const imageUrl = version._resolvedUrl || version.public_url || '';
                  const settings = (version.generation_settings || {}) as Record<string, unknown>;

                  return (
                    <motion.div
                      key={version.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`relative flex gap-4 pb-6 ${isCurrent ? '' : ''}`}
                    >
                      {/* Timeline dot */}
                      <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        isCurrent
                          ? 'bg-accent text-accent-foreground'
                          : isOriginal
                          ? 'bg-secondary text-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {isOriginal ? (
                          <Sparkles className="w-4 h-4" />
                        ) : version.asset_type === 'video' ? (
                          <Film className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </div>

                      {/* Version card */}
                      <div className={`flex-1 rounded-xl border p-3 transition-colors ${
                        isCurrent ? 'border-accent/40 bg-accent/5' : 'border-border bg-card hover:bg-muted/50'
                      }`}>
                        <div className="flex gap-3">
                          {/* Thumbnail */}
                          {imageUrl && (
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                              <img
                                src={imageUrl}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium">
                                {isOriginal ? 'Original' : `v${version.lineage_depth + 1}`}
                              </span>
                              {isCurrent && (
                                <Badge variant="outline" className="text-[9px] h-4 bg-accent/20 text-accent border-0">
                                  Current
                                </Badge>
                              )}
                              {version.is_favorite && (
                                <Heart className="w-3 h-3 text-accent fill-accent" />
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                              <Clock className="w-3 h-3" />
                              <span>{format(new Date(version.created_at), 'MMM d, yyyy h:mm a')}</span>
                            </div>

                            {/* Settings */}
                            <div className="flex flex-wrap gap-1">
                              {settings.realism_mode && (
                                <Badge variant="outline" className="text-[9px] h-4">
                                  {String(settings.realism_mode)}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[9px] h-4 capitalize">
                                {version.source_type.replace('_', ' ')}
                              </Badge>
                              <Badge variant="outline" className="text-[9px] h-4 capitalize">
                                {version.status}
                              </Badge>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-1.5 mt-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2"
                                onClick={() => onToggleFavorite?.(version)}
                              >
                                <Heart className={`w-3 h-3 mr-1 ${version.is_favorite ? 'fill-accent text-accent' : ''}`} />
                                {version.is_favorite ? 'Unfavorite' : 'Favorite'}
                              </Button>
                              {version.asset_type === 'image' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[10px] px-2"
                                    onClick={() => onCreateVariation?.(version)}
                                  >
                                    <Copy className="w-3 h-3 mr-1" /> Variation
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[10px] px-2"
                                    onClick={() => onCreateReel?.(version)}
                                  >
                                    <Film className="w-3 h-3 mr-1" /> Reel
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
