import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ActionItem {
  id: string;
  action_type: string;
  priority: string;
  title: string;
  description: string;
  cta_label: string;
  cta_route: string;
  status: string;
  created_at: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const PRIORITY_BORDER: Record<string, string> = {
  high: 'hsl(var(--destructive))',
  medium: 'hsl(38, 92%, 50%)',
  low: 'hsl(var(--muted-foreground))',
};

interface ActionFeedProps {
  actions: ActionItem[];
  loading: boolean;
  onActionsChange: (actions: ActionItem[]) => void;
}

export function ActionFeed({ actions, loading, onActionsChange }: ActionFeedProps) {
  const handleDismiss = async (actionId: string) => {
    await supabase
      .from('action_feed_items')
      .update({ status: 'dismissed' })
      .eq('id', actionId);
    onActionsChange(actions.filter((a) => a.id !== actionId));
  };

  const handleComplete = async (actionId: string) => {
    await supabase
      .from('action_feed_items')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', actionId);
    onActionsChange(actions.filter((a) => a.id !== actionId));
  };

  const handleSnooze = async (actionId: string, days: number) => {
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('action_feed_items')
      .update({ status: 'snoozed', expires_at: expiresAt })
      .eq('id', actionId);
    onActionsChange(actions.filter((a) => a.id !== actionId));
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          Pulse Actions
        </h2>
        {actions.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {actions.length} pending
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-accent mb-4" />
            <h3 className="font-medium mb-1">All caught up!</h3>
            <p className="text-sm text-muted-foreground">
              No pending actions. Check back later for recommendations.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {actions.map((action) => (
            <Card
              key={action.id}
              className="border-l-4"
              style={{ borderLeftColor: PRIORITY_BORDER[action.priority] || PRIORITY_BORDER.low }}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={`text-xs ${PRIORITY_COLORS[action.priority] || PRIORITY_COLORS.low}`}
                      >
                        {action.priority}
                      </Badge>
                      {action.priority === 'high' && (
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      )}
                    </div>
                    <h3 className="font-medium text-sm mb-1">{action.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {action.description}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" asChild>
                      <Link to={action.cta_route}>{action.cta_label}</Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-muted-foreground">
                          <X className="w-3 h-3 mr-1" /> More
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleComplete(action.id)}>
                          <CheckCircle2 className="w-4 h-4 mr-2" /> Mark done
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSnooze(action.id, 1)}>
                          <Clock className="w-4 h-4 mr-2" /> Snooze 1 day
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSnooze(action.id, 7)}>
                          <Clock className="w-4 h-4 mr-2" /> Snooze 1 week
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDismiss(action.id)}>
                          Dismiss
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
