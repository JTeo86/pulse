import { useState, useCallback, useEffect, useRef, ImgHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Image as ImageIcon } from 'lucide-react';

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError' | 'onLoad'> {
  /** Primary URL to attempt */
  src: string | null | undefined;
  /** Optional fallback URL if primary fails */
  fallbackSrc?: string | null;
  /** Show this icon when all sources fail. Defaults to Image icon. */
  fallbackIcon?: ReactNode;
  /** Overlay children rendered on top of the image (checkboxes, badges, hover actions) */
  children?: ReactNode;
  /** CSS class for the container wrapper */
  containerClassName?: string;
  /** Aspect ratio class (e.g. 'aspect-square'). Applied to container. */
  aspectClassName?: string;
  /** Hint browser about relative fetch priority when needed. */
  fetchPriority?: 'high' | 'low';
  /** Opt-in eager loading for above-the-fold/hero imagery. */
  eager?: boolean;
}

/**
 * Resilient image component with:
 * - skeleton loading state
 * - error fallback (alternate URL → icon)
 * - lazy loading by default
 * - no layout jumps
 * - children overlay support
 */
export function MediaImage({
  src,
  fallbackSrc,
  fallbackIcon,
  children,
  containerClassName,
  aspectClassName = 'aspect-square',
  fetchPriority,
  eager = false,
  className,
  alt = '',
  ...imgProps
}: MediaImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [activeSrc, setActiveSrc] = useState(src || fallbackSrc || '');
  const triedFallback = useRef(false);

  // Reset when src changes
  useEffect(() => {
    triedFallback.current = false;
    const newSrc = src || fallbackSrc || '';
    setActiveSrc(newSrc);
    setStatus(newSrc ? 'loading' : 'error');
  }, [src, fallbackSrc]);

  const handleLoad = useCallback(() => setStatus('loaded'), []);

  const handleError = useCallback(() => {
    if (!triedFallback.current && fallbackSrc && activeSrc !== fallbackSrc) {
      triedFallback.current = true;
      setActiveSrc(fallbackSrc);
      setStatus('loading');
    } else {
      setStatus('error');
    }
  }, [fallbackSrc, activeSrc]);

  const showSkeleton = status === 'loading' && !!activeSrc;
  const showError = status === 'error' || !activeSrc;
  const loading = imgProps.loading ?? (eager ? 'eager' : 'lazy');
  const decoding = imgProps.decoding ?? 'async';

  return (
    <div className={cn('relative overflow-hidden bg-muted', aspectClassName, containerClassName)}>
      {/* Skeleton pulse while loading */}
      {showSkeleton && (
        <div className="absolute inset-0 animate-pulse bg-muted" />
      )}

      {/* Error / fallback icon */}
      {showError && (
        <div className="absolute inset-0 flex items-center justify-center">
          {fallbackIcon || (
            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
          )}
        </div>
      )}

      {/* Actual image */}
      {activeSrc && !showError && (
        <img
          {...imgProps}
          src={activeSrc}
          alt={alt}
          loading={loading}
          decoding={decoding}
          fetchPriority={fetchPriority}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            className
          )}
        />
      )}

      {/* Overlay children */}
      {children}
    </div>
  );
}
