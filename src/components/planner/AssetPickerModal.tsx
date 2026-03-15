import { useState, useMemo } from 'react';
import { Image, Film, Search, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContentAssets, ContentAsset } from '@/hooks/use-content-assets';

interface AssetPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: ContentAsset) => void;
  assetType?: 'image' | 'video';
}

export function AssetPickerModal({ open, onClose, onSelect, assetType }: AssetPickerModalProps) {
  const { data: imageAssets = [] } = useContentAssets('image');
  const { data: videoAssets = [] } = useContentAssets('video');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<string>(assetType || 'image');

  const assets = tab === 'image' ? imageAssets : videoAssets;

  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter(a =>
      (a.title || '').toLowerCase().includes(q) ||
      (a.source_type || '').toLowerCase().includes(q)
    );
  }, [assets, search]);

  const handleSelect = (asset: ContentAsset) => {
    onSelect(asset);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Attach Existing Asset</DialogTitle>
          <DialogDescription>Select an asset from your content library to attach to this brief.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {!assetType && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="image" className="gap-2">
                <Image className="w-3 h-3" /> Images ({imageAssets.length})
              </TabsTrigger>
              <TabsTrigger value="video" className="gap-2">
                <Film className="w-3 h-3" /> Videos ({videoAssets.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No assets found. Generate content in the Studio first.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-1">
              {filtered.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => handleSelect(asset)}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:border-accent transition-colors bg-muted"
                >
                  {asset._resolvedUrl ? (
                    <img
                      src={asset._resolvedUrl}
                      alt={asset.title || ''}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {asset.asset_type === 'video' ? (
                        <Film className="w-6 h-6 text-muted-foreground" />
                      ) : (
                        <Image className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-accent text-accent-foreground rounded-full p-1.5">
                      <Check className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-[10px] text-white truncate">{asset.title || asset.source_type}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
