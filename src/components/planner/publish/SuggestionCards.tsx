import { motion } from 'framer-motion';
import {
  Plus, Image as ImageIcon, Video, Mail, MessageSquare,
  Camera, Play, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SuggestedPostPack } from './post-pack-engine';

interface SuggestionCardsProps {
  suggestions: SuggestedPostPack[];
  onCreatePack: (suggestion: SuggestedPostPack) => void;
}

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  instagram_feed: Instagram,
  instagram_stories: Play,
  instagram_reels: Video,
  tiktok: Video,
  email: Mail,
  sms: MessageSquare,
};

export function SuggestionCards({ suggestions, onCreatePack }: SuggestionCardsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-medium text-foreground">Suggested Post Packs</h3>
        <Badge variant="secondary" className="text-[10px]">{suggestions.length} available</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Pulse assembled these from your approved copy and assets. Click to create a post pack.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {suggestions.map((suggestion, i) => {
          const ChannelIcon = CHANNEL_ICONS[suggestion.channel] || ImageIcon;
          return (
            <motion.button
              key={suggestion.channel}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onCreatePack(suggestion)}
              className="flex items-start gap-3 p-3 rounded-xl border border-accent/15 bg-accent/5 hover:bg-accent/10 transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-accent/15 shrink-0 mt-0.5">
                <ChannelIcon className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{suggestion.channelLabel}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{suggestion.reason}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {suggestion.suggestedCaption && (
                    <Badge variant="outline" className="text-[9px]">Copy ✓</Badge>
                  )}
                  {suggestion.suggestedAssetId && (
                    <Badge variant="outline" className="text-[9px]">
                      {suggestion.prefersVideo ? 'Video ✓' : 'Image ✓'}
                    </Badge>
                  )}
                </div>
              </div>
              <Plus className="w-4 h-4 text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
