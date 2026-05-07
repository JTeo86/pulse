import { motion } from 'framer-motion';
import { BackButton } from '@/components/navigation/BackButton';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { PlansTab } from '@/components/planner/PlansTab';
import { useCommandCentre } from '@/hooks/use-command-centre';

export default function CampaignsPage() {
  const { data, isLoading } = useCommandCentre();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <BackButton fallbackTo="/command-centre" label="Back to Command Centre" />
      <PageHeader
        title="Campaigns & Visibility"
        description="Coordinate campaigns around trading periods, offers, approvals, linked assets, and reliable publishing coverage."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          label="Days Ahead Covered"
          value={isLoading ? '—' : String(data?.visibility.daysCoveredAhead ?? 0)}
          detail="Publishing coverage already prepared"
        />
        <SummaryCard
          label="Weak Periods"
          value={isLoading ? '—' : String(data?.visibility.missingTradingPeriods.length ?? 0)}
          detail="Trading windows with weak visibility"
        />
        <SummaryCard
          label="Stale Campaigns"
          value={isLoading ? '—' : String(data?.visibility.staleCampaignCount ?? 0)}
          detail="Plans that need refreshing"
        />
        <SummaryCard
          label="Asset Support"
          value={isLoading ? '—' : data?.visibility.noRecentAssetSignal ? 'Needs refresh' : 'Healthy'}
          detail="Whether fresh assets are supporting current plans"
        />
      </div>

      {!!data?.visibility.missingTradingPeriods.length && (
        <Card className="border-warning/20 bg-warning/5">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Visibility gaps to close this week</p>
            <div className="flex flex-wrap gap-2">
              {data.visibility.missingTradingPeriods.map((gap) => (
                <span key={gap} className="rounded-full border border-warning/30 bg-background px-3 py-1 text-xs">
                  {gap}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <PlansTab />
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
