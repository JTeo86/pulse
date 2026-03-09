import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Plug, Settings2, Flag, Network, Film } from 'lucide-react';
import FeatureFlagsTab from '@/components/admin/FeatureFlagsTab';
import PlatformConfigTab from '@/components/admin/PlatformConfigTab';
import ReferralNetworkTab from '@/components/admin/ReferralNetworkTab';
import VideoProviderTab from '@/components/admin/VideoProviderTab';

// Integrations & API Keys tab — lifted directly from AdminIntegrations page
import AdminIntegrationsContent from '@/components/admin/AdminIntegrationsContent';

export default function PlatformAdmin() {
  const [activeTab, setActiveTab] = useState('integrations');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center">
              <Shield className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-medium">Platform Admin</h1>
              <p className="text-sm text-muted-foreground">Operational control panel</p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Manage API credentials, platform configuration, and feature flags. Changes affect all workspaces.
          </p>
        </div>
      </div>

      {/* Warning Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 text-sm">
        <Shield className="w-3.5 h-3.5 text-destructive" />
        <span className="text-destructive font-medium">Admin Only</span>
        <span className="text-muted-foreground">• Changes affect all workspaces</span>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="integrations" className="gap-2">
            <Plug className="w-4 h-4" />
            Integrations & API Keys
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings2 className="w-4 h-4" />
            Product Defaults
          </TabsTrigger>
          <TabsTrigger value="flags" className="gap-2">
            <Flag className="w-4 h-4" />
            Feature Flags
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-2">
            <Film className="w-4 h-4" />
            Video Provider
          </TabsTrigger>
          <TabsTrigger value="referral" className="gap-2">
            <Network className="w-4 h-4" />
            Referral Network
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-6">
          <AdminIntegrationsContent />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <PlatformConfigTab />
        </TabsContent>

        <TabsContent value="flags" className="mt-6">
          <FeatureFlagsTab />
        </TabsContent>

        <TabsContent value="video" className="mt-6">
          <VideoProviderTab />
        </TabsContent>

        <TabsContent value="referral" className="mt-6">
          <ReferralNetworkTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
