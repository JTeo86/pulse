import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Mail, FileText, Megaphone, MessageSquare, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';


const moduleIcons: Record<string, typeof Mail> = {
  email: Mail,
  blog: FileText,
  ad_copy: Megaphone,
  sms_push: MessageSquare,
};

const moduleLabels: Record<string, string> = {
  email: 'Email',
  blog: 'Blog',
  ad_copy: 'Ad Copy',
  sms_push: 'SMS/Push',
};

const goalLabels: Record<string, string> = {
  promote_event: 'Promote Event',
  new_menu: 'New Menu',
  seasonal_offer: 'Seasonal Offer',
  brand_story: 'Brand Story',
  drive_bookings: 'Drive Bookings',
  last_minute: 'Last-Minute',
};

export interface CopyProject {
  id: string;
  module: string;
  goal: string;
  inputs: Record<string, any>;
  created_at: string;
}

interface RecentDraftsProps {
  refreshTrigger?: number;
  onSelectProject?: (project: CopyProject) => void;
}

export function RecentDrafts({ refreshTrigger, onSelectProject }: RecentDraftsProps) {
  const { currentVenue, isAdmin, isDemoMode } = useVenue();
  const { toast } = useToast();
  const [projects, setProjects] = useState<CopyProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    if (!currentVenue) return;

    try {
      const { data, error } = await supabase
        .from('copy_projects')
        .select('*')
        .eq('venue_id', currentVenue.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      
      // Cast the data to handle the inputs field type
      const typedData = (data || []).map(item => ({
        ...item,
        inputs: item.inputs as Record<string, any>
      }));
      
      setProjects(typedData);
    } catch (error: any) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [currentVenue, refreshTrigger]);

  const handleDelete = async (id: string) => {
    if (isDemoMode) {
      toast({
        variant: 'destructive',
        title: 'Demo Mode',
        description: 'Cannot delete in demo mode.',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('copy_projects')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setProjects(projects.filter(p => p.id !== id));
      toast({ title: 'Project deleted' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete',
        description: error.message,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        Loading recent drafts...
      </div>
    );
  }

  if (projects.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Clock className="h-4 w-4" />
        Recent Drafts
      </div>

      <div className="grid gap-2">
        {projects.map((project) => {
          const Icon = moduleIcons[project.module] || FileText;
          return (
            <div
              key={project.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors group cursor-pointer"
              onClick={() => onSelectProject?.(project)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {moduleLabels[project.module] || project.module}
                    </Badge>
                    <span className="text-sm truncate">
                      {goalLabels[project.goal] || project.goal}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {project.inputs?.key_message?.substring(0, 50)}...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(project.created_at), 'MMM d')}
                </span>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(project.id)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
