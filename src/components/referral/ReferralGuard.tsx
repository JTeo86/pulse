import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useReferralAccess } from '@/hooks/use-referral-access';

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
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}
