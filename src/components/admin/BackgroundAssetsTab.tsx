import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ShieldCheck, ShieldAlert, ShieldQuestion, Image as ImageIcon } from 'lucide-react';
import { AspectRatio } from '@/components/ui/aspect-ratio';

interface BackgroundAsset {
  id: string;
  venue_id: string | null;
  name: string;
  category: string;
  vibe_tags: string[];
  file_url: string;
  storage_path: string | null;
  license_type: 'owned' | 'commercial_stock' | 'cc0' | 'user_uploaded' | 'other';
  license_url: string | null;
  license_proof_file_url: string | null;
  commercial_safe_status: 'approved' | 'blocked' | 'review_required';
  allow_in_production: boolean;
  created_at: string;
}

const LICENSE_TYPES = [
  { value: 'owned', label: 'Owned' },
  { value: 'commercial_stock', label: 'Commercial Stock' },
  { value: 'cc0', label: 'CC0 (Public Domain)' },
  { value: 'user_uploaded', label: 'User Uploaded' },
  { value: 'other', label: 'Other' },
];

const CATEGORIES = ['solid', 'gradient', 'texture', 'lifestyle', 'hospitality', 'minimal'];
const VIBE_OPTIONS = ['casual', 'premium', 'luxury', 'nightlife', 'family', 'rustic', 'modern'];

export default function BackgroundAssetsTab() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<BackgroundAsset | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'solid',
    vibe_tags: [] as string[],
    file_url: '',
    license_type: 'owned' as BackgroundAsset['license_type'],
    license_url: '',
    commercial_safe_status: 'review_required' as BackgroundAsset['commercial_safe_status'],
    allow_in_production: false,
  });

  const { data: assets, isLoading } = useQuery({
    queryKey: ['background-assets-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('background_assets')
        .select('*')
        .is('venue_id', null) // Global assets only for admin
        .order('name');
      if (error) throw error;
      return data as BackgroundAsset[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      const payload = {
        name: data.name,
        category: data.category,
        vibe_tags: data.vibe_tags,
        file_url: data.file_url,
        license_type: data.license_type,
        license_url: data.license_url || null,
        commercial_safe_status: data.commercial_safe_status,
        allow_in_production: data.allow_in_production,
        venue_id: null, // Global asset
      };

      if (data.id) {
        const { error } = await supabase
          .from('background_assets')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('background_assets')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['background-assets-admin'] });
      toast.success(editingAsset ? 'Asset updated' : 'Asset added');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Failed to save asset: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('background_assets')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['background-assets-admin'] });
      toast.success('Asset deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete asset: ' + error.message);
    },
  });

  const handleOpenDialog = (asset?: BackgroundAsset) => {
    if (asset) {
      setEditingAsset(asset);
      setFormData({
        name: asset.name,
        category: asset.category,
        vibe_tags: asset.vibe_tags,
        file_url: asset.file_url,
        license_type: asset.license_type,
        license_url: asset.license_url || '',
        commercial_safe_status: asset.commercial_safe_status,
        allow_in_production: asset.allow_in_production,
      });
    } else {
      setEditingAsset(null);
      setFormData({
        name: '',
        category: 'solid',
        vibe_tags: [],
        file_url: '',
        license_type: 'owned',
        license_url: '',
        commercial_safe_status: 'review_required',
        allow_in_production: false,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAsset(null);
  };

  const handleSave = () => {
    if (!formData.name.trim() || !formData.file_url.trim()) {
      toast.error('Name and file URL are required');
      return;
    }
    saveMutation.mutate({ ...formData, id: editingAsset?.id });
  };

  const toggleVibeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      vibe_tags: prev.vibe_tags.includes(tag)
        ? prev.vibe_tags.filter(t => t !== tag)
        : [...prev.vibe_tags, tag]
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
            <ShieldCheck className="w-3 h-3" />
            Approved
          </Badge>
        );
      case 'blocked':
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
            <ShieldAlert className="w-3 h-3" />
            Blocked
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 gap-1">
            <ShieldQuestion className="w-3 h-3" />
            Review
          </Badge>
        );
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Global Background Library</CardTitle>
          <CardDescription>
            Manage commercially-safe background assets available to all workspaces
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Background
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingAsset ? 'Edit Background' : 'Add Background'}</DialogTitle>
              <DialogDescription>
                Add a background asset with license information
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Marble White"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file_url">Image URL</Label>
                <Input
                  id="file_url"
                  value={formData.file_url}
                  onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              {formData.file_url && (
                <div className="w-32">
                  <AspectRatio ratio={16/9} className="bg-muted rounded-lg overflow-hidden">
                    <img src={formData.file_url} alt="Preview" className="w-full h-full object-cover" />
                  </AspectRatio>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vibe Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {VIBE_OPTIONS.map((vibe) => (
                    <Badge
                      key={vibe}
                      variant={formData.vibe_tags.includes(vibe) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleVibeTag(vibe)}
                    >
                      {vibe}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_type">License Type</Label>
                <Select 
                  value={formData.license_type} 
                  onValueChange={(v: BackgroundAsset['license_type']) => setFormData({ ...formData, license_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LICENSE_TYPES.map((lt) => (
                      <SelectItem key={lt.value} value={lt.value}>{lt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_url">License URL (optional)</Label>
                <Input
                  id="license_url"
                  value={formData.license_url}
                  onChange={(e) => setFormData({ ...formData, license_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial_safe_status">Commercial Safety Status</Label>
                <Select 
                  value={formData.commercial_safe_status} 
                  onValueChange={(v: BackgroundAsset['commercial_safe_status']) => setFormData({ ...formData, commercial_safe_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="review_required">Review Required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="allow_in_production">Allow in Production</Label>
                <Switch
                  id="allow_in_production"
                  checked={formData.allow_in_production}
                  onCheckedChange={(checked) => setFormData({ ...formData, allow_in_production: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading assets...</div>
        ) : assets?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No background assets configured</div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preview</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>License</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets?.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    <div className="w-16 h-10 rounded overflow-hidden bg-muted">
                      {asset.file_url ? (
                        <img src={asset.file_url} alt={asset.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{asset.name}</div>
                      <div className="flex gap-1 mt-1">
                        {asset.vibe_tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{asset.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {LICENSE_TYPES.find(lt => lt.value === asset.license_type)?.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(asset.commercial_safe_status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(asset)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(asset.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
