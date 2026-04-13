import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Plug, Settings2, Flag, Network, Film, CreditCard, Layers } from 'lucide-react';
import FeatureFlagsTab from '@/components/admin/FeatureFlagsTab';
import PlatformConfigTab from '@/components/admin/PlatformConfigTab';
import ReferralNetworkTab from '@/components/admin/ReferralNetworkTab';
import VideoProviderTab from '@/components/admin/VideoProviderTab';
import BillingConfigTab from '@/components/admin/BillingConfigTab';
import SubscriptionTiersTab from '@/components/admin/SubscriptionTiersTab';
import AdminIntegrationsContent from '@/components/admin/AdminIntegrationsContent';

export default function PlatformAdmin() {
  const [activeTab, setActiveTab] = useState('integrations');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-7xl mx-auto px-6 space-y-6"
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 min-w-0">
        <div className="relative min-w-0">
          <div className="w-full overflow-x-auto">
            <TabsList className="flex gap-2 min-w-max bg-muted/50">
              <TabsTrigger value="integrations" className="gap-2 whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-sm">
                <Plug className="h-4 w-4" />
                Integrations & API Keys
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-2 whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-sm">
                <Settings2 className="h-4 w-4" />
                Product Defaults
              </TabsTrigger>
              <TabsTrigger value="flags" className="gap-2 whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-sm">
                <Flag className="h-4 w-4" />
                Feature Flags
              </TabsTrigger>
              <TabsTrigger value="video" className="gap-2 whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-sm">
                <Film className="h-4 w-4" />
                Video Provider
              </TabsTrigger>
              <TabsTrigger value="referral" className="gap-2 whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-sm">
                <Network className="h-4 w-4" />
                Referral Release Control
              </TabsTrigger>
              <TabsTrigger value="billing-config" className="gap-2 whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-sm">
                <CreditCard className="h-4 w-4" />
                Billing Config
              </TabsTrigger>
              <TabsTrigger
                value="subscription-tiers"
                className="gap-2 whitespace-nowrap shrink-0 rounded-lg px-4 py-2 text-sm"
              >
                <Layers className="h-4 w-4" />
                Subscription Tiers
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
        </div>

        <TabsContent value="integrations" className="mt-6 min-w-0">
          <AdminIntegrationsContent />
        </TabsContent>

        <TabsContent value="config" className="mt-6 min-w-0">
          <PlatformConfigTab />
        </TabsContent>

        <TabsContent value="flags" className="mt-6 min-w-0">
          <FeatureFlagsTab />
        </TabsContent>

        <TabsContent value="video" className="mt-6 min-w-0">
          <VideoProviderTab />
        </TabsContent>

        <TabsContent value="referral" className="mt-6 min-w-0">
          <ReferralNetworkTab />
        </TabsContent>

        <TabsContent value="billing-config" className="mt-6 min-w-0">
          <BillingConfigTab />
        </TabsContent>

        <TabsContent value="subscription-tiers" className="mt-6 min-w-0">
          <SubscriptionTiersTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
