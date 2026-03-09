import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useReferralAccess } from '@/hooks/use-referral-access';
import { Badge } from '@/components/ui/badge';

interface Props {
  children: ReactNode;
}

export function ReferralGuard({ children }: Props) {
  const { venueHasAccess, isLoading } = useReferralAccess();

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!venueHasAccess) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

export function BetaBadge() {
  const { isBetaVenue, flags } = useReferralAccess();

  if (!isBetaVenue || flags.publicLaunch) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge className="bg-accent/15 text-accent border-accent/25 text-xs font-medium">Beta</Badge>
      <span className="text-xs text-muted-foreground hidden sm:inline">
        This feature is currently being tested with selected venues.
      </span>
    </div>
  );
}
