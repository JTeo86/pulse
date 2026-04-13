import { type ComponentType, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Plug,
  Settings2,
  Flag,
  Network,
  Film,
  CreditCard,
  Layers,
  ChevronsUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import FeatureFlagsTab from '@/components/admin/FeatureFlagsTab';
import PlatformConfigTab from '@/components/admin/PlatformConfigTab';
import ReferralNetworkTab from '@/components/admin/ReferralNetworkTab';
import VideoProviderTab from '@/components/admin/VideoProviderTab';
import BillingConfigTab from '@/components/admin/BillingConfigTab';
import SubscriptionTiersTab from '@/components/admin/SubscriptionTiersTab';
import AdminIntegrationsContent from '@/components/admin/AdminIntegrationsContent';

type SectionId =
  | 'integrations'
  | 'config'
  | 'flags'
  | 'referral'
  | 'billing-config'
  | 'subscription-tiers'
  | 'video';

interface SectionItem {
  id: SectionId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

interface SectionGroup {
  label: string;
  items: SectionItem[];
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    label: 'Core',
    items: [
      {
        id: 'integrations',
        label: 'Integrations & API Keys',
        description: 'Manage API credentials and provider access.',
        icon: Plug,
      },
      {
        id: 'config',
        label: 'Product Defaults',
        description: 'Configure default platform behaviors and settings.',
        icon: Settings2,
      },
      {
        id: 'flags',
        label: 'Feature Flags',
        description: 'Control feature availability across all workspaces.',
        icon: Flag,
      },
    ],
  },
  {
    label: 'Growth',
    items: [
      {
        id: 'referral',
        label: 'Referral Release Control',
        description: 'Manage referral availability and launch stages.',
        icon: Network,
      },
      {
        id: 'billing-config',
        label: 'Billing Config',
        description: 'Set billing rules and payment configuration.',
        icon: CreditCard,
      },
      {
        id: 'subscription-tiers',
        label: 'Subscription Tiers',
        description: 'Define pricing tiers, limits, and entitlements.',
        icon: Layers,
      },
    ],
  },
  {
    label: 'Media',
    items: [
      {
        id: 'video',
        label: 'Video Provider',
        description: 'Set and validate the active video generation provider.',
        icon: Film,
      },
    ],
  },
];

const SECTION_LOOKUP = SECTION_GROUPS.flatMap((group) => group.items).reduce<Record<SectionId, SectionItem>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<SectionId, SectionItem>);

function renderSectionContent(sectionId: SectionId) {
  switch (sectionId) {
    case 'integrations':
      return <AdminIntegrationsContent />;
    case 'config':
      return <PlatformConfigTab />;
    case 'flags':
      return <FeatureFlagsTab />;
    case 'video':
      return <VideoProviderTab />;
    case 'referral':
      return <ReferralNetworkTab />;
    case 'billing-config':
      return <BillingConfigTab />;
    case 'subscription-tiers':
      return <SubscriptionTiersTab />;
    default:
      return null;
  }
}

export default function PlatformAdmin() {
  const [activeSection, setActiveSection] = useState<SectionId>('integrations');

  const activeSectionMeta = useMemo(() => SECTION_LOOKUP[activeSection], [activeSection]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-7xl mx-auto px-6 space-y-5"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center">
              <Shield className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-medium">Platform Admin</h1>
              <p className="text-sm text-muted-foreground">Operational control panel</p>
            </div>
            <Badge variant="destructive" className="text-xs">Admin Only</Badge>
          </div>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Manage API credentials, platform configuration, and operational feature controls across all workspaces.
          </p>
        </div>
      </header>

      <section className="space-y-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6 lg:space-y-0">
        <div className="lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between h-10">
                <span className="truncate">{activeSectionMeta.label}</span>
                <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
              {SECTION_GROUPS.map((group) => (
                <div key={group.label} className="py-1">
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.id} onClick={() => setActiveSection(item.id)}>
                        <Icon className="w-4 h-4 mr-2" />
                        {item.label}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-20 self-start rounded-xl border bg-card p-3">
          <nav className="space-y-4">
            {SECTION_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className={cn(
                          'w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left transition-colors whitespace-nowrap',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 space-y-4">
          <div className="rounded-xl border bg-card px-4 py-3 sm:px-5">
            <h2 className="text-lg font-semibold">{activeSectionMeta.label}</h2>
            <p className="text-sm text-muted-foreground">{activeSectionMeta.description}</p>
          </div>
          <div className="min-w-0">{renderSectionContent(activeSection)}</div>
        </main>
      </section>
    </motion.div>
  );
}
