import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Target } from 'lucide-react';
import type { CommandOpportunity } from '@/hooks/use-command-centre';

const TYPE_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  reputation: 'Reputation',
  visibility: 'Visibility',
  lead_referral: 'Lead / Referral',
  seasonal: 'Seasonal',
  event: 'Event',
  retention: 'Retention',
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-warning/10 text-warning border-warning/20',
  low: 'bg-muted text-muted-foreground border-border',
};

interface OpportunityBoardProps {
  opportunities: CommandOpportunity[];
  compact?: boolean;
}

export function OpportunityBoard({ opportunities, compact = false }: OpportunityBoardProps) {
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = useMemo(() => {
    const rows = typeFilter === 'all'
      ? opportunities
      : opportunities.filter((item) => item.type === typeFilter);
    return compact ? rows.slice(0, 6) : rows;
  }, [compact, opportunities, typeFilter]);

  if (opportunities.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-0">
          <EmptyState
            icon={Target}
            title="No opportunities detected"
            description="Pulse will surface seasonal, visibility, reputation, and referral opportunities here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <Tabs value={typeFilter} onValueChange={setTypeFilter}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="reputation">Reputation</TabsTrigger>
            <TabsTrigger value="visibility">Visibility</TabsTrigger>
            <TabsTrigger value="lead_referral">Lead / Referral</TabsTrigger>
            <TabsTrigger value="seasonal">Seasonal</TabsTrigger>
            <TabsTrigger value="event">Event</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="grid gap-3">
        {filtered.map((opportunity) => (
          <Card key={opportunity.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium">{opportunity.title}</p>
                  <p className="text-xs text-muted-foreground">{opportunity.description}</p>
                </div>
                <Badge variant="outline" className={PRIORITY_STYLES[opportunity.priority]}>
                  {opportunity.priority}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{TYPE_LABELS[opportunity.type] || opportunity.type}</Badge>
                <Badge variant="outline">{opportunity.source}</Badge>
                <Badge variant="secondary" className="capitalize">{opportunity.status}</Badge>
              </div>

              <div className="rounded-lg bg-muted/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggested Action</p>
                <p className="text-sm mt-1">{opportunity.suggestedAction}</p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Source: {opportunity.source}</p>
                <Button size="sm" asChild>
                  <Link to={opportunity.ctaTo}>{opportunity.ctaLabel}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
