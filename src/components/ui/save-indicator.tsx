import { Check, Loader2, AlertCircle } from 'lucide-react';
import type { SaveStatus } from '@/hooks/use-optimistic-mutation';

export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground animate-in fade-in duration-200">
      {status === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
      {status === 'saved' && <><Check className="w-3 h-3 text-emerald-500" /> Saved</>}
      {status === 'error' && <><AlertCircle className="w-3 h-3 text-destructive" /> Error saving</>}
    </span>
  );
}
