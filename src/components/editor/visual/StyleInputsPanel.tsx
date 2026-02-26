import { Info, Palette, ImageIcon, UtensilsCrossed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StyleInputsPanelProps {
  brandPreset: string;
  atmosphereCount: number;
  platingCount: number;
  hasProfile: boolean;
}

export default function StyleInputsPanel({
  brandPreset,
  atmosphereCount,
  platingCount,
  hasProfile,
}: StyleInputsPanelProps) {
  return (
    <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Info className="w-3.5 h-3.5" />
        <span className="font-medium">Style inputs:</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Palette className="w-3.5 h-3.5 text-accent" />
        <span className="capitalize">{brandPreset}</span>
      </div>
      <Badge variant="secondary" className="text-xs gap-1 py-0">
        <ImageIcon className="w-3 h-3" />
        {atmosphereCount} atmosphere ref{atmosphereCount !== 1 ? 's' : ''}
      </Badge>
      <Badge variant="secondary" className="text-xs gap-1 py-0">
        <UtensilsCrossed className="w-3 h-3" />
        {platingCount} plating ref{platingCount !== 1 ? 's' : ''}
      </Badge>
      {hasProfile && (
        <Badge variant="outline" className="text-xs py-0 text-accent border-accent/30">
          Profile active
        </Badge>
      )}
    </div>
  );
}
