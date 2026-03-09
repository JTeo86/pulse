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
import { Plus, Pencil, ExternalLink, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';

interface AIModel {
  id: string;
  provider_id: string;
  model_key: string;
  display_name: string;
  task_types: string[];
  commercial_safe_status: 'approved' | 'blocked' | 'review_required';
  license_summary: string | null;
  license_url: string | null;
  allow_in_production: boolean;
  created_at: string;
}

interface AIProvider {
  id: string;
  name: string;
  type: string;
}

export default function AIModelsTab() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [formData, setFormData] = useState({
    provider_id: '',
    model_key: '',
    display_name: '',
    task_types: '',
    commercial_safe_status: 'review_required' as 'approved' | 'blocked' | 'review_required',
    license_summary: '',
    license_url: '',
    allow_in_production: false,
  });

  const { data: providers } = useQuery({
    queryKey: ['ai-providers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_providers')
        .select('id, name, type')
        .order('name');
      if (error) throw error;
      return data as AIProvider[];
    },
  });

  const { data: models, isLoading } = useQuery({
    queryKey: ['ai-models'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_models')
        .select('*, ai_providers(name)')
        .order('display_name');
      if (error) throw error;
      return data as (AIModel & { ai_providers: { name: string } })[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { id?: string }) => {
      const taskTypesArray = data.task_types.split(',').map(t => t.trim()).filter(Boolean);
      
      if (data.id) {
        const { error } = await supabase
          .from('ai_models')
          .update({
            provider_id: data.provider_id,
            model_key: data.model_key,
            display_name: data.display_name,
            task_types: taskTypesArray,
            commercial_safe_status: data.commercial_safe_status,
            license_summary: data.license_summary || null,
            license_url: data.license_url || null,
            allow_in_production: data.allow_in_production,
          })
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ai_models')
          .insert({
            provider_id: data.provider_id,
            model_key: data.model_key,
            display_name: data.display_name,
            task_types: taskTypesArray,
            commercial_safe_status: data.commercial_safe_status,
            license_summary: data.license_summary || null,
            license_url: data.license_url || null,
            allow_in_production: data.allow_in_production,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-models'] });
      toast.success(editingModel ? 'Model updated' : 'Model added');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Failed to save model: ' + error.message);
    },
  });

  const handleOpenDialog = (model?: AIModel & { ai_providers: { name: string } }) => {
    if (model) {
      setEditingModel(model);
      setFormData({
        provider_id: model.provider_id,
        model_key: model.model_key,
        display_name: model.display_name,
        task_types: model.task_types.join(', '),
        commercial_safe_status: model.commercial_safe_status,
        license_summary: model.license_summary || '',
        license_url: model.license_url || '',
        allow_in_production: model.allow_in_production,
      });
    } else {
      setEditingModel(null);
      setFormData({
        provider_id: providers?.[0]?.id || '',
        model_key: '',
        display_name: '',
        task_types: '',
        commercial_safe_status: 'review_required',
        license_summary: '',
        license_url: '',
        allow_in_production: false,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingModel(null);
  };

  const handleSave = () => {
    if (!formData.provider_id || !formData.model_key || !formData.display_name) {
      toast.error('Provider, model key, and display name are required');
      return;
    }
    saveMutation.mutate({ ...formData, id: editingModel?.id });
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
          <CardTitle>AI Models</CardTitle>
          <CardDescription>
            Manage individual models and their commercial safety status
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Model
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingModel ? 'Edit Model' : 'Add Model'}</DialogTitle>
              <DialogDescription>
                Configure an AI model for the Visual Editor
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="provider_id">Provider</Label>
                <Select value={formData.provider_id} onValueChange={(v) => setFormData({ ...formData, provider_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="model_key">Model Key</Label>
                <Input
                  id="model_key"
                  value={formData.model_key}
                  onChange={(e) => setFormData({ ...formData, model_key: e.target.value })}
                  placeholder="e.g., background-removal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="display_name">Display Name</Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="e.g., Background Removal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_types">Task Types (comma-separated)</Label>
                <Input
                  id="task_types"
                  value={formData.task_types}
                  onChange={(e) => setFormData({ ...formData, task_types: e.target.value })}
                  placeholder="e.g., background_removal, enhance"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial_safe_status">Commercial Safety Status</Label>
                <Select 
                  value={formData.commercial_safe_status} 
                  onValueChange={(v: 'approved' | 'blocked' | 'review_required') => setFormData({ ...formData, commercial_safe_status: v })}
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
              <div className="space-y-2">
                <Label htmlFor="license_url">License URL</Label>
                <Input
                  id="license_url"
                  value={formData.license_url}
                  onChange={(e) => setFormData({ ...formData, license_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_summary">License Summary</Label>
                <Textarea
                  id="license_summary"
                  value={formData.license_summary}
                  onChange={(e) => setFormData({ ...formData, license_summary: e.target.value })}
                  placeholder="Brief summary of license terms..."
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
          <div className="text-center py-8 text-muted-foreground">Loading models...</div>
        ) : models?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No models configured</div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Production</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models?.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{model.display_name}</div>
                      <div className="text-xs text-muted-foreground">{model.model_key}</div>
                    </div>
                  </TableCell>
                  <TableCell>{model.ai_providers?.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {model.task_types.slice(0, 2).map((task) => (
                        <Badge key={task} variant="secondary" className="text-xs">
                          {task}
                        </Badge>
                      ))}
                      {model.task_types.length > 2 && (
                        <Badge variant="secondary" className="text-xs">+{model.task_types.length - 2}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(model.commercial_safe_status)}</TableCell>
                  <TableCell>
                    {model.allow_in_production ? (
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
                      {model.license_url && (
                        <Button variant="ghost" size="icon" asChild>
                          <a href={model.license_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(model)}>
                        <Pencil className="w-4 h-4" />
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
