import { useState } from 'react';
import { Pin, Trash2, MessageSquare, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { StyleAssetWithAnalysis } from '@/types/style-intelligence';
import { useToast } from '@/hooks/use-toast';

interface StyleAssetCardProps {
  asset: StyleAssetWithAnalysis;
  canEdit: boolean;
  onUpdate: () => void;
}

export function StyleAssetCard({ asset, canEdit, onUpdate }: StyleAssetCardProps) {
  const { toast } = useToast();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(asset.user_notes || '');
  const [saving, setSaving] = useState(false);

  const togglePin = async () => {
    try {
      const { error } = await supabase
        .from('style_reference_assets')
        .update({ pinned: !asset.pinned })
        .eq('id', asset.id);
      if (error) throw error;
      onUpdate();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const deleteAsset = async () => {
    if (!confirm('Delete this reference image? This cannot be undone.')) return;
    try {
      // Delete from storage (both paths)
      const bucketMap: Record<string, string> = {
        brand: 'brand_inspiration',
        atmosphere: 'venue_atmosphere',
        plating: 'plating_style',
      };
      const bucket = bucketMap[asset.channel];
      const pathsToDelete = [asset.storage_path, asset.thumbnail_path].filter(Boolean) as string[];
      if (pathsToDelete.length) await supabase.storage.from(bucket).remove(pathsToDelete);

      const { error } = await supabase.from('style_reference_assets').delete().eq('id', asset.id);
      if (error) throw error;
      toast({ title: 'Reference deleted' });
      onUpdate();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('style_reference_assets')
        .update({ user_notes: notes })
        .eq('id', asset.id);
      if (error) throw error;
      setEditingNotes(false);
      onUpdate();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const analysis = asset.analysis;
  const palette = analysis?.analysis_json?.palette;
  const moodTags = analysis?.analysis_json?.mood_tags || [];
  const composition = analysis?.analysis_json?.composition;

  const statusIcon = {
    pending_analysis: <Clock className="w-3 h-3 text-amber-400" />,
    analyzed: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    failed: <AlertCircle className="w-3 h-3 text-destructive" />,
  }[asset.status];

  return (
    <div className="group relative rounded-xl overflow-hidden border border-border bg-card hover:border-accent/40 transition-all duration-200">
      {/* Thumbnail */}
      <div className="relative aspect-square">
        <img
          src={asset.thumbnailUrl}
          alt="Style reference"
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Status badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm text-xs">
          {statusIcon}
          {asset.status === 'pending_analysis' && <span className="text-muted-foreground">Analyzing</span>}
          {asset.status === 'failed' && <span className="text-destructive">Failed</span>}
        </div>

        {/* Pinned indicator */}
        {asset.pinned && (
          <div className="absolute top-2 right-2 p-1 rounded-full bg-accent text-accent-foreground">
            <Pin className="w-3 h-3 fill-current" />
          </div>
        )}

        {/* Hover overlay with actions */}
        {canEdit && (
          <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant={asset.pinned ? 'default' : 'secondary'}
              className="w-8 h-8"
              onClick={togglePin}
              title={asset.pinned ? 'Unpin' : 'Pin (boost weight)'}
            >
              <Pin className={`w-4 h-4 ${asset.pinned ? 'fill-current' : ''}`} />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="w-8 h-8"
              onClick={() => setEditingNotes(!editingNotes)}
              title="Add notes"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="destructive"
              className="w-8 h-8"
              onClick={deleteAsset}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Analysis chips */}
      {analysis && (
        <div className="p-2 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {palette?.temperature && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {palette.temperature}
              </span>
            )}
            {palette?.saturation && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {palette.saturation} sat
              </span>
            )}
            {composition?.angle && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {composition.angle}
              </span>
            )}
          </div>
          {moodTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {moodTags.slice(0, 3).map((tag: string) => (
                <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 capitalize">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {analysis.confidence_score > 0 && (
            <div className="flex items-center gap-1">
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent/60 rounded-full"
                  style={{ width: `${Math.round(analysis.confidence_score * 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {Math.round(analysis.confidence_score * 100)}%
              </span>
            </div>
          )}
          {asset.user_notes && !editingNotes && (
            <p className="text-xs text-muted-foreground italic truncate">{asset.user_notes}</p>
          )}
        </div>
      )}

      {/* Notes editor */}
      {editingNotes && (
        <div className="p-2 border-t border-border space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this reference…"
            className="text-xs min-h-[60px] resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>Cancel</Button>
            <Button size="sm" onClick={saveNotes} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
