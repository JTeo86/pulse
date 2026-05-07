import { motion } from 'framer-motion';
import { BackButton } from '@/components/navigation/BackButton';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OpportunityBoard } from '@/components/opportunities/OpportunityBoard';
import { useCommandCentre } from '@/hooks/use-command-centre';

export default function OpportunitiesPage() {
  const { data, isLoading } = useCommandCentre();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <BackButton fallbackTo="/home" label="Back to Command Centre" />
      <PageHeader
        title="Opportunities"
        description="A live commercial view of revenue, reputation, visibility, seasonal, and referral opportunities."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Open Opportunities"
          value={isLoading ? '—' : String(data?.opportunities.filter((item) => item.status === 'open').length ?? 0)}
          detail="Signals that still need action"
        />
        <SummaryCard
          label="Tracked"
          value={isLoading ? '—' : String(data?.opportunities.filter((item) => item.status === 'tracked').length ?? 0)}
          detail="Commercial work already in motion"
        />
        <SummaryCard
          label="Priority Mix"
          value={isLoading ? '—' : `${data?.opportunities.filter((item) => item.priority === 'high').length ?? 0} high`}
          detail="Highest-urgency items first"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : (
        <OpportunityBoard opportunities={data?.opportunities ?? []} />
      )}
    </motion.div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
