import { ReactNode } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { usePartnerAccess } from '@/hooks/use-partner-access';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Gift,
  Link2,
  BarChart3,
  Wallet,
  User,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', path: '/partner', icon: LayoutDashboard },
  { label: 'Offers', path: '/partner/offers', icon: Gift },
  { label: 'Links', path: '/partner/links', icon: Link2 },
  { label: 'Referrals', path: '/partner/referrals', icon: BarChart3 },
  { label: 'Earnings', path: '/partner/earnings', icon: Wallet },
  { label: 'Profile', path: '/partner/profile', icon: User },
];

export function PartnerLayout({ children }: { children: ReactNode }) {
  const { hasAccess, isLoading, isBeta, flags, referrer } = usePartnerAccess();
  const { user, loading: authLoading, signOut } = useAuth();
  const location = useLocation();

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <Link2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">Invite Required</h1>
          <p className="text-muted-foreground mb-6">
            The Pulse Partner Portal is available by invitation only. If you have been invited, please check you are signed in with the correct email.
          </p>
          <Button variant="outline" onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-foreground tracking-tight">Pulse</span>
            <span className="text-sm text-muted-foreground">Partner</span>
          </div>
          {isBeta && !flags.publicLaunch && (
            <Badge className="mt-2 bg-accent/15 text-accent border-accent/25 text-xs">Beta</Badge>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground mb-2 truncate">
            {referrer?.full_name || user.email}
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Pulse</span>
            <span className="text-sm text-muted-foreground">Partner</span>
            {isBeta && !flags.publicLaunch && (
              <Badge className="bg-accent/15 text-accent border-accent/25 text-xs">Beta</Badge>
            )}
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="md:hidden flex overflow-x-auto border-b border-border px-2 gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap transition-colors border-b-2',
                  isActive
                    ? 'border-accent text-accent font-medium'
                    : 'border-transparent text-muted-foreground'
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Beta banner */}
        {isBeta && !flags.publicLaunch && (
          <div className="bg-accent/5 border-b border-accent/10 px-4 py-2 text-center">
            <span className="text-xs text-muted-foreground">
              You are part of the Pulse Referral Network beta.
            </span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
