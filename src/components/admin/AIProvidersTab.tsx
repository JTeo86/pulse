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
import { Plus, Pencil, ExternalLink, Check, X } from 'lucide-react';

interface AIProvider {
  id: string;
  name: string;
  type: 'image' | 'video' | 'text';
  is_active: boolean;
  commercial_use_allowed: boolean;
  notes: string | null;
  docs_url: string | null;
  created_at: string;
}

export default function AIProvidersTab() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'image' as 'image' | 'video' | 'text',
    is_active: true,
    commercial_use_allowed: false,
    notes: '',
    docs_url: '',
  });

  const { data: providers, isLoading } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_providers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as AIProvider[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from('ai_providers')
          .update({
            name: data.name,
            type: data.type,
            is_active: data.is_active,
            commercial_use_allowed: data.commercial_use_allowed,
            notes: data.notes || null,
            docs_url: data.docs_url || null,
          })
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ai_providers')
          .insert({
            name: data.name,
            type: data.type,
            is_active: data.is_active,
            commercial_use_allowed: data.commercial_use_allowed,
            notes: data.notes || null,
            docs_url: data.docs_url || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success(editingProvider ? 'Provider updated' : 'Provider added');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Failed to save provider: ' + error.message);
    },
  });

  const handleOpenDialog = (provider?: AIProvider) => {
    if (provider) {
      setEditingProvider(provider);
      setFormData({
        name: provider.name,
        type: provider.type,
        is_active: provider.is_active,
        commercial_use_allowed: provider.commercial_use_allowed,
        notes: provider.notes || '',
        docs_url: provider.docs_url || '',
      });
    } else {
      setEditingProvider(null);
      setFormData({
        name: '',
        type: 'image',
        is_active: true,
        commercial_use_allowed: false,
        notes: '',
        docs_url: '',
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingProvider(null);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error('Provider name is required');
      return;
    }
    saveMutation.mutate({ ...formData, id: editingProvider?.id });
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      image: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      video: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      text: 'bg-green-500/10 text-green-400 border-green-500/20',
    };
    return <Badge variant="outline" className={colors[type]}>{type}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>AI Providers</CardTitle>
          <CardDescription>
            Manage AI service providers and their commercial use permissions
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Provider
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingProvider ? 'Edit Provider' : 'Add Provider'}</DialogTitle>
              <DialogDescription>
                Configure an AI provider for the Visual Editor
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Provider Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., PhotoRoom"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(v: 'image' | 'video' | 'text') => setFormData({ ...formData, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="commercial_use">Commercial Use Allowed</Label>
                <Switch
                  id="commercial_use"
                  checked={formData.commercial_use_allowed}
                  onCheckedChange={(checked) => setFormData({ ...formData, commercial_use_allowed: checked })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docs_url">Documentation URL</Label>
                <Input
                  id="docs_url"
                  value={formData.docs_url}
                  onChange={(e) => setFormData({ ...formData, docs_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="License details, restrictions, etc."
                  rows={3}
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
          <div className="text-center py-8 text-muted-foreground">Loading providers...</div>
        ) : providers?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No providers configured</div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Commercial Use</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers?.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="font-medium">{provider.name}</TableCell>
                  <TableCell>{getTypeBadge(provider.type)}</TableCell>
                  <TableCell>
                    {provider.is_active ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    {provider.commercial_use_allowed ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                        Allowed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">
                        Blocked
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {provider.docs_url && (
                      <a href={provider.docs_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(provider)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
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
