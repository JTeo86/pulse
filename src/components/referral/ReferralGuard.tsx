import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useReferralAccess } from '@/hooks/use-referral-access';
import { Button } from '@/components/ui/button';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';

interface Props {
  children: ReactNode;
  minimumStage?: 1 | 2 | 3;
}

export function ReferralGuard({ children, minimumStage = 1 }: Props) {
  const { hasAccess, stage, isLoading } = useReferralAccess();

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasAccess || stage < minimumStage) {
    return (
      <div className="max-w-2xl">
        <UpgradePrompt
          title="This feature is not in your current plan yet"
          description="You're still able to use the rest of Pulse without interruption."
          benefit="Upgrading unlocks marketplace tools so your team can discover more growth opportunities in one place."
          ctaLabel="See pricing"
          ctaTo="/pricing"
          secondaryAction={(
            <Button asChild variant="ghost" size="sm">
              <Link to="/home">Back to home</Link>
            </Button>
          )}
        />
      </div>
    );
  }

  return <>{children}</>;
}
