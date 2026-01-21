import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload as UploadIcon, FileEdit, Send, Sparkles } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';

// Import existing functionality
import UploadTab from '@/components/editor/UploadTab';
import DraftsTab from '@/components/editor/DraftsTab';
import PublishingTab from '@/components/editor/PublishingTab';

export default function TheEditorPage() {
  const [activeTab, setActiveTab] = useState('upload');

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        {/* Module Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="font-serif text-2xl font-medium">TheEditor</h1>
                <p className="text-sm text-muted-foreground">Hospitality Edition</p>
              </div>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              Transform venue photos into brand-consistent social content. 
              Upload, review AI-generated drafts, and publish when ready.
            </p>
          </div>
        </div>

        {/* Module Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-sm">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="text-accent font-medium">Premium Module</span>
          <span className="text-muted-foreground">• Hospitality-grade content engine</span>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="upload" className="gap-2">
              <UploadIcon className="w-4 h-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-2">
              <FileEdit className="w-4 h-4" />
              Drafts & Review
            </TabsTrigger>
            <TabsTrigger value="publishing" className="gap-2">
              <Send className="w-4 h-4" />
              Publishing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-6">
            <UploadTab />
          </TabsContent>

          <TabsContent value="drafts" className="mt-6">
            <DraftsTab />
          </TabsContent>

          <TabsContent value="publishing" className="mt-6">
            <PublishingTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </AppLayout>
  );
}
