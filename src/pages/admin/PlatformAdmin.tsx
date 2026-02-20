import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Brain, Image, Layers, Flag } from 'lucide-react';
import AIProvidersTab from '@/components/admin/AIProvidersTab';
import AIModelsTab from '@/components/admin/AIModelsTab';
import BackgroundAssetsTab from '@/components/admin/BackgroundAssetsTab';
import OverlayTemplatesTab from '@/components/admin/OverlayTemplatesTab';
import FeatureFlagsTab from '@/components/admin/FeatureFlagsTab';

export default function PlatformAdmin() {
  const [activeTab, setActiveTab] = useState('providers');

  return (
    <>
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
                <p className="text-sm text-muted-foreground">Commercial-Safe Governance</p>
              </div>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              Manage AI providers, models, background assets, and overlay templates. 
              Only approved resources can be used in production.
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
            <TabsTrigger value="providers" className="gap-2">
              <Brain className="w-4 h-4" />
              AI Providers
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2">
              <Brain className="w-4 h-4" />
              AI Models
            </TabsTrigger>
            <TabsTrigger value="backgrounds" className="gap-2">
              <Image className="w-4 h-4" />
              Backgrounds
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <Layers className="w-4 h-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="flags" className="gap-2">
              <Flag className="w-4 h-4" />
              Feature Flags
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="mt-6">
            <AIProvidersTab />
          </TabsContent>

          <TabsContent value="models" className="mt-6">
            <AIModelsTab />
          </TabsContent>

          <TabsContent value="backgrounds" className="mt-6">
            <BackgroundAssetsTab />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <OverlayTemplatesTab />
          </TabsContent>

          <TabsContent value="flags" className="mt-6">
            <FeatureFlagsTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </>
  );
}
