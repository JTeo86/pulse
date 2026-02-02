import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Flag, Video, Image } from 'lucide-react';

interface FeatureFlag {
  id: string;
  venue_id: string | null;
  flag_key: string;
  is_enabled: boolean;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const FLAG_INFO: Record<string, { name: string; description: string; icon: typeof Flag }> = {
  visual_editor_v2: {
    name: 'V2 Video Engine',
    description: 'Enable Kling-powered video generation (image-to-video, motion templates)',
    icon: Video,
  },
  visual_editor_v1: {
    name: 'V1 Image Engine',
    description: 'Enable PhotoRoom-powered image editing (background removal, enhancement)',
    icon: Image,
  },
};

export default function FeatureFlagsTab() {
  const queryClient = useQueryClient();

  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .is('venue_id', null) // Global flags only
        .order('flag_key');
      if (error) throw error;
      return data as FeatureFlag[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ is_enabled: isEnabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags-admin'] });
      toast.success('Feature flag updated');
    },
    onError: (error) => {
      toast.error('Failed to update flag: ' + error.message);
    },
  });

  const addDefaultFlagsMutation = useMutation({
    mutationFn: async () => {
      // Add V1 flag if it doesn't exist
      const { data: existingV1 } = await supabase
        .from('feature_flags')
        .select('id')
        .is('venue_id', null)
        .eq('flag_key', 'visual_editor_v1')
        .single();
      
      if (!existingV1) {
        const { error } = await supabase
          .from('feature_flags')
          .insert({
            venue_id: null,
            flag_key: 'visual_editor_v1',
            is_enabled: true,
            config_json: { description: 'V1 Image Engine (PhotoRoom)' }
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags-admin'] });
    },
  });

  // Add default flags on mount if needed
  if (!isLoading && flags && !flags.find(f => f.flag_key === 'visual_editor_v1')) {
    addDefaultFlagsMutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Flags</CardTitle>
        <CardDescription>
          Control which Visual Editor engines are available globally
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading flags...</div>
        ) : flags?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No feature flags configured</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flags?.map((flag) => {
                const info = FLAG_INFO[flag.flag_key] || {
                  name: flag.flag_key,
                  description: (flag.config_json as { description?: string })?.description || 'No description',
                  icon: Flag,
                };
                const IconComponent = info.icon;
                
                return (
                  <TableRow key={flag.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <IconComponent className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{info.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {info.description}
                    </TableCell>
                    <TableCell>
                      {flag.is_enabled ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          Disabled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={flag.is_enabled}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: flag.id, isEnabled: checked })}
                        disabled={toggleMutation.isPending}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* V2 Coming Soon Notice */}
        <div className="mt-6 p-4 rounded-lg border border-accent/20 bg-accent/5">
          <div className="flex items-start gap-3">
            <Video className="w-5 h-5 text-accent mt-0.5" />
            <div>
              <h4 className="font-medium text-sm">V2 Video Engine (Kling)</h4>
              <p className="text-sm text-muted-foreground mt-1">
                When enabled, workspaces can generate 6-10 second promo clips from images. 
                Requires commercial license verification before enabling in production.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
