import { ChannelProfile } from '@/types/style-intelligence';
import { TrendingUp } from 'lucide-react';

interface StyleProfileSummaryProps {
  profile: ChannelProfile | null;
  label: string;
}

export function StyleProfileSummary({ profile, label }: StyleProfileSummaryProps) {
  if (!profile || profile.sample_size === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Upload references to generate a {label.toLowerCase()} profile.
      </div>
    );
  }

  const sig = profile.signature as unknown as Record<string, Record<string, unknown>>;
  const mood = (sig?.mood_tags || []) as string[];
  const consistency = (profile.consistency?.overall as number) ?? 0;
  const paletteTemp = sig?.palette?.temperature as string | undefined;
  const lightingType = sig?.lighting?.type as string | undefined;
  const compositionAngle = sig?.composition?.angle as string | undefined;
  const colorGrading = sig?.editing_style?.color_grading as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-accent" />
        <span className="text-muted-foreground">
          {profile.sample_size} reference{profile.sample_size !== 1 ? 's' : ''} analyzed
        </span>
        <span className="ml-auto text-muted-foreground">
          {Math.round(consistency * 100)}% consistent
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {paletteTemp && (
          <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 capitalize">
            {paletteTemp} tones
          </span>
        )}
        {lightingType && (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
            {lightingType} light
          </span>
        )}
        {compositionAngle && (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
            {compositionAngle}
          </span>
        )}
        {colorGrading && (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
            {colorGrading}
          </span>
        )}
        {mood.slice(0, 3).map((t: string) => (
          <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
