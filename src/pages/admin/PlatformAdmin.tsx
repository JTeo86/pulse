import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Plug, Settings2, Flag, Network, Film, CreditCard, Layers, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FeatureFlagsTab from '@/components/admin/FeatureFlagsTab';
import PlatformConfigTab from '@/components/admin/PlatformConfigTab';
import ReferralNetworkTab from '@/components/admin/ReferralNetworkTab';
import VideoProviderTab from '@/components/admin/VideoProviderTab';
import BillingConfigTab from '@/components/admin/BillingConfigTab';
import SubscriptionTiersTab from '@/components/admin/SubscriptionTiersTab';
import AdminIntegrationsContent from '@/components/admin/AdminIntegrationsContent';

type AdminSection = {
  key: string;
  label: string;
  icon: LucideIcon;
};

const adminSections: AdminSection[] = [
  { key: 'integrations', label: 'Integrations & API Keys', icon: Plug },
  { key: 'config', label: 'Product Defaults', icon: Settings2 },
  { key: 'flags', label: 'Feature Flags', icon: Flag },
  { key: 'video', label: 'Video Provider', icon: Film },
  { key: 'referral', label: 'Referral Release Control', icon: Network },
  { key: 'billing-config', label: 'Billing Config', icon: CreditCard },
  { key: 'subscription-tiers', label: 'Subscription Tiers', icon: Layers },
];

export default function PlatformAdmin() {
  const [activeSection, setActiveSection] = useState(adminSections[0].key);

  const activeSectionContent = useMemo(() => {
    switch (activeSection) {
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
        return <AdminIntegrationsContent />;
    }
  }, [activeSection]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-7xl space-y-6 px-6 overflow-x-hidden"
    >
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-destructive/20 to-destructive/5">
              <Shield className="h-5 w-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-2xl font-medium">Platform Admin</h1>
              <p className="text-sm text-muted-foreground">Operational control panel</p>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Manage API credentials, platform configuration, and feature flags. Changes affect all workspaces.
          </p>
        </div>
      </div>

      <div className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-sm">
        <Shield className="h-3.5 w-3.5 text-destructive" />
        <span className="font-medium text-destructive">Admin Only</span>
        <span className="text-muted-foreground">• Changes affect all workspaces</span>
      </div>

      <div className="md:hidden">
        <Select value={activeSection} onValueChange={setActiveSection}>
          <SelectTrigger aria-label="Select admin section" className="w-full">
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {adminSections.map((section) => (
              <SelectItem key={section.key} value={section.key}>
                {section.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-0 gap-6 md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
        <aside className="hidden md:block md:sticky md:top-6 self-start">
          <nav className="w-[240px] rounded-xl border bg-card p-2" aria-label="Platform admin sections">
            {adminSections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.key;

              return (
                <Button
                  key={section.key}
                  variant={isActive ? 'secondary' : 'ghost'}
                  className="mb-1 h-auto w-full justify-start gap-2 whitespace-normal px-3 py-2 text-left"
                  onClick={() => setActiveSection(section.key)}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-sm leading-snug">{section.label}</span>
                </Button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 overflow-x-hidden">{activeSectionContent}</section>
      </div>
    </motion.div>
  );
}
