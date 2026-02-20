import { motion } from 'framer-motion';
import { Send, Calendar, Download, ExternalLink, Info } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';

export default function IntegrationsPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader
        title="Publishing"
        description="Export your content and connect to scheduling tools. API keys are managed in Admin → Integrations & API Keys."
      />

      <div className="max-w-2xl space-y-6">
        {/* Phase 1 info */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-accent/5 border border-accent/20">
          <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Phase 1: Export & Use Any Scheduler</p>
            <p className="text-sm text-muted-foreground mt-1">
              Download your generated images and copy from the Editor and Copywriter modules,
              then upload to Buffer, Hootsuite, Later, or any other scheduler. 
              Native integrations are coming in Phase 2.
            </p>
          </div>
        </div>

        {/* Export workflow */}
        <div className="card-elevated p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Download className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-medium">Export Publish Pack</h3>
              <p className="text-sm text-muted-foreground">Download images + captions ready for any platform</p>
            </div>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground list-none">
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>Generate a Pro Photo in the Editor</li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>Generate a caption in the Copywriter</li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>Download the image (1:1, 4:5, or 9:16)</li>
            <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>Paste caption + image into your scheduler</li>
          </ol>
        </div>

        {/* Buffer — coming soon */}
        <div className="card-elevated p-6">
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#323232] flex items-center justify-center">
                <span className="text-white font-bold text-lg">B</span>
              </div>
              <div>
                <h3 className="font-medium">Buffer</h3>
                <p className="text-sm text-muted-foreground">
                  Direct scheduling to your social channels
                </p>
              </div>
            </div>
            <Button variant="outline" disabled className="shrink-0">
              Coming in Phase 2
            </Button>
          </div>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Phase 2 will include direct Buffer integration — approve content here and push it 
              straight to your Buffer queue without manual downloads.
            </p>
          </div>
        </div>

        {/* Make.com — coming soon */}
        <div className="card-elevated p-6">
          <div className="flex items-start justify-between">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#6c4ed9] flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
              <div>
                <h3 className="font-medium">Make.com</h3>
                <p className="text-sm text-muted-foreground">
                  Automation workflows for content publishing
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="https://make.com" target="_blank" rel="noopener noreferrer">
                Learn more
                <ExternalLink className="w-3 h-3 ml-2" />
              </a>
            </Button>
          </div>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Make.com can automate your publishing workflow via webhooks.
              Contact your administrator to configure the webhook URL.
            </p>
          </div>
        </div>

        {/* Info note */}
        <p className="text-xs text-muted-foreground">
          API keys for integrations are managed by platform admins in{' '}
          <span className="font-medium text-foreground">Admin → Integrations & API Keys</span>.
        </p>
      </div>
    </motion.div>
  );
}
