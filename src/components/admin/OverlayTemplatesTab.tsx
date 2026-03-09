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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ShieldCheck, ShieldAlert, ShieldQuestion, Layers } from 'lucide-react';

interface OverlayTemplate {
  id: string;
  venue_id: string | null;
  name: string;
  style_tags: string[];
  layout_schema: Record<string, unknown>;
  preview_url: string | null;
  license_type: 'owned' | 'commercial_stock' | 'cc0' | 'user_uploaded' | 'other';
  commercial_safe_status: 'approved' | 'blocked' | 'review_required';
  allow_in_production: boolean;
  created_at: string;
}

const STYLE_OPTIONS = ['minimal', 'bold', 'elegant', 'playful', 'modern', 'vintage', 'luxury', 'casual'];

export default function OverlayTemplatesTab() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OverlayTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    style_tags: [] as string[],
    layout_schema: '{}',
    preview_url: '',
    license_type: 'owned' as OverlayTemplate['license_type'],
    commercial_safe_status: 'review_required' as OverlayTemplate['commercial_safe_status'],
    allow_in_production: false,
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ['overlay-templates-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overlay_templates')
        .select('*')
        .is('venue_id', null) // Global templates only
        .order('name');
      if (error) throw error;
      return data as OverlayTemplate[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      let layoutSchema = {};
      try {
        layoutSchema = JSON.parse(data.layout_schema);
      } catch {
        throw new Error('Invalid JSON in layout schema');
      }

      const payload = {
        name: data.name,
        style_tags: data.style_tags,
        layout_schema: layoutSchema,
        preview_url: data.preview_url || null,
        license_type: data.license_type,
        commercial_safe_status: data.commercial_safe_status,
        allow_in_production: data.allow_in_production,
        venue_id: null, // Global template
      };

      if (data.id) {
        const { error } = await supabase
          .from('overlay_templates')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('overlay_templates')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overlay-templates-admin'] });
      toast.success(editingTemplate ? 'Template updated' : 'Template added');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Failed to save template: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('overlay_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overlay-templates-admin'] });
      toast.success('Template deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete template: ' + error.message);
    },
  });

  const handleOpenDialog = (template?: OverlayTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        style_tags: template.style_tags,
        layout_schema: JSON.stringify(template.layout_schema, null, 2),
        preview_url: template.preview_url || '',
        license_type: template.license_type,
        commercial_safe_status: template.commercial_safe_status,
        allow_in_production: template.allow_in_production,
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: '',
        style_tags: [],
        layout_schema: '{\n  "type": "promo",\n  "elements": []\n}',
        preview_url: '',
        license_type: 'owned',
        commercial_safe_status: 'review_required',
        allow_in_production: false,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error('Template name is required');
      return;
    }
    saveMutation.mutate({ ...formData, id: editingTemplate?.id });
  };

  const toggleStyleTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      style_tags: prev.style_tags.includes(tag)
        ? prev.style_tags.filter(t => t !== tag)
        : [...prev.style_tags, tag]
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
          <CardTitle>Global Overlay Templates</CardTitle>
          <CardDescription>
            Manage promo overlay templates available to all workspaces
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Edit Template' : 'Add Template'}</DialogTitle>
              <DialogDescription>
                Create an overlay template with layout schema
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Tonight Only - Bold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preview_url">Preview Image URL (optional)</Label>
                <Input
                  id="preview_url"
                  value={formData.preview_url}
                  onChange={(e) => setFormData({ ...formData, preview_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label>Style Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_OPTIONS.map((style) => (
                    <Badge
                      key={style}
                      variant={formData.style_tags.includes(style) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleStyleTag(style)}
                    >
                      {style}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="layout_schema">Layout Schema (JSON)</Label>
                <Textarea
                  id="layout_schema"
                  value={formData.layout_schema}
                  onChange={(e) => setFormData({ ...formData, layout_schema: e.target.value })}
                  placeholder="{}"
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial_safe_status">Commercial Safety Status</Label>
                <Select 
                  value={formData.commercial_safe_status} 
                  onValueChange={(v: OverlayTemplate['commercial_safe_status']) => setFormData({ ...formData, commercial_safe_status: v })}
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
          <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
        ) : templates?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No overlay templates configured</div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preview</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Styles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Production</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates?.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <div className="w-16 h-10 rounded overflow-hidden bg-muted flex items-center justify-center">
                      {template.preview_url ? (
                        <img src={template.preview_url} alt={template.name} className="w-full h-full object-cover" />
                      ) : (
                        <Layers className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{template.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {template.style_tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                      {template.style_tags.length > 3 && (
                        <Badge variant="secondary" className="text-xs">+{template.style_tags.length - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(template.commercial_safe_status)}</TableCell>
                  <TableCell>
                    {template.allow_in_production ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                        Yes
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        No
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(template)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(template.id)}
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
