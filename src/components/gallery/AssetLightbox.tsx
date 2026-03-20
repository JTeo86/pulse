import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContentAsset } from '@/hooks/use-content-assets';
import { format } from 'date-fns';

interface AssetLightboxProps {
  asset: ContentAsset | null;
  assets: ContentAsset[];
  open: boolean;
  onClose: () => void;
  onNavigate: (asset: ContentAsset) => void;
}

export function AssetLightbox({ asset, assets, open, onClose, onNavigate }: AssetLightboxProps) {
  const [zoomed, setZoomed] = useState(false);

  const currentIndex = asset ? assets.findIndex(a => a.id === asset.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < assets.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) onNavigate(assets[currentIndex - 1]);
  }, [hasPrev, currentIndex, assets, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) onNavigate(assets[currentIndex + 1]);
  }, [hasNext, currentIndex, assets, onNavigate]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, handlePrev, handleNext]);

  // Reset zoom on asset change
  useEffect(() => setZoomed(false), [asset?.id]);

  const handleDownload = async () => {
    if (!asset) return;
    const url = asset._resolvedUrl || asset.public_url || '';
    if (!url) return;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = asset.title || `asset-${asset.id.slice(0, 8)}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  if (!open || !asset) return null;

  const imageUrl = asset._resolvedUrl || asset.public_url || '';
  const sourceLabel = asset.source_type === 'generated_image' ? 'Generated'
    : asset.source_type === 'variation' ? 'Variation'
    : asset.source_type === 'upload' ? 'Upload'
    : asset.source_type;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/95 backdrop-blur-sm" />

          {/* Content */}
          <div
            className="relative z-10 flex flex-col items-center w-full h-full p-4 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top bar */}
            <div className="flex items-center justify-between w-full max-w-5xl mb-4">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-xs capitalize">
                  {sourceLabel}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {asset.title || 'Untitled'} · {format(new Date(asset.created_at), 'MMM d, yyyy')}
                </span>
                {assets.length > 1 && (
                  <span className="text-xs text-muted-foreground">
                    {currentIndex + 1} / {assets.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoomed(!zoomed)}>
                  {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                  <Download className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Image area */}
            <div className="flex-1 flex items-center justify-center w-full max-w-5xl relative min-h-0">
              {/* Prev */}
              {hasPrev && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-0 z-10 h-10 w-10 rounded-full bg-card/80 border border-border shadow-md"
                  onClick={handlePrev}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              )}

              {/* Image */}
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className={`max-h-full max-w-full flex items-center justify-center ${zoomed ? 'overflow-auto cursor-zoom-out' : 'cursor-zoom-in'}`}
                onClick={() => setZoomed(!zoomed)}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={asset.title || 'Asset preview'}
                    className={`rounded-lg shadow-2xl transition-all duration-300 ${
                      zoomed ? 'max-w-none w-auto h-auto' : 'max-h-[calc(100vh-200px)] max-w-full object-contain'
                    }`}
                  />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    No preview available
                  </div>
                )}
              </motion.div>

              {/* Next */}
              {hasNext && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 z-10 h-10 w-10 rounded-full bg-card/80 border border-border shadow-md"
                  onClick={handleNext}
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              )}
            </div>

            {/* Bottom metadata */}
            <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
              <span className="capitalize">{asset.status}</span>
              {asset.mime_type && <span>{asset.mime_type}</span>}
              {asset.width && asset.height && <span>{asset.width}×{asset.height}</span>}
              {(asset.metadata as any)?.generation_mode && (
                <span className="capitalize">{(asset.metadata as any).generation_mode} mode</span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
