import { motion } from 'framer-motion';
import { Plug, Check, ExternalLink } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';

export default function IntegrationsPage() {
  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <PageHeader
          title="Integrations"
          description="Connect external services to automate publishing"
        />

        <div className="max-w-2xl space-y-6">
          {/* Buffer Integration */}
          <div className="card-elevated p-6">
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#323232] flex items-center justify-center">
                  <span className="text-white font-bold text-lg">B</span>
                </div>
                <div>
                  <h3 className="font-medium">Buffer</h3>
                  <p className="text-sm text-muted-foreground">
                    Schedule and publish content to your social channels
                  </p>
                </div>
              </div>
              <Button variant="outline" disabled>
                Coming soon
              </Button>
            </div>

            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Buffer integration is handled via Make.com automation. Once configured, 
                approved content will be automatically sent to your Buffer queue.
              </p>
            </div>
          </div>

          {/* Make.com Integration */}
          <div className="card-elevated p-6">
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#6c4ed9] flex items-center justify-center">
                  <span className="text-white font-bold text-lg">M</span>
                </div>
                <div>
                  <h3 className="font-medium">Make.com</h3>
                  <p className="text-sm text-muted-foreground">
                    Automation platform for content generation and publishing
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-success text-sm">
                <Check className="w-4 h-4" />
                Required
              </div>
            </div>

            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">
                Make.com handles the heavy lifting: AI content generation, image enhancement, 
                and publishing to Buffer. Contact your administrator for webhook setup.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="https://make.com" target="_blank" rel="noopener noreferrer">
                  Learn more
                  <ExternalLink className="w-3 h-3 ml-2" />
                </a>
              </Button>
            </div>
          </div>

          {/* Info box */}
          <div className="p-4 border border-border rounded-lg">
            <h4 className="font-medium mb-2">How integrations work</h4>
            <p className="text-sm text-muted-foreground">
              TheEditor.ai uses Make.com as the automation layer. When you upload photos, 
              Make.com processes them with AI. When you approve content, Make.com sends it 
              to Buffer. This keeps all heavy processing outside your browser.
            </p>
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
}
