import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Cookie, X } from 'lucide-react';
import { useCookies } from '@/lib/cookie-context';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

export function CookieBanner() {
  const { bannerVisible, modalVisible, acceptAll, rejectNonEssential, savePrefs, openModal, closeModal } = useCookies();
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  return (
    <>
      {/* ── Banner ── */}
      <AnimatePresence>
        {bannerVisible && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
          >
            <div className="max-w-3xl mx-auto bg-card border border-border rounded-xl shadow-elevated p-5 md:p-6">
              <div className="flex items-start gap-4">
                <div className="shrink-0 mt-0.5">
                  <Cookie className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground mb-1">We use cookies</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We use essential cookies to run Pulse, and optional analytics and marketing cookies to improve your experience. You can manage preferences any time via the footer.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={openModal}
                >
                  Manage preferences
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={rejectNonEssential}
                >
                  Reject non-essential
                </Button>
                <Button
                  size="sm"
                  className="text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={acceptAll}
                >
                  Accept all
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Preferences Modal ── */}
      <Dialog open={modalVisible} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Cookie preferences</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Choose which cookies you allow. Necessary cookies cannot be disabled as they are required for Pulse to function.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Necessary */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/40">
              <div>
                <p className="text-sm font-medium text-foreground">Necessary</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Required for authentication, security, and core functionality. Always active.
                </p>
              </div>
              <Switch checked disabled className="shrink-0 mt-0.5" />
            </div>

            {/* Analytics */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/40">
              <div>
                <Label htmlFor="analytics-toggle" className="text-sm font-medium text-foreground cursor-pointer">
                  Analytics
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Helps us understand how Pulse is used so we can improve it. No personal data is sold.
                </p>
              </div>
              <Switch
                id="analytics-toggle"
                checked={analytics}
                onCheckedChange={setAnalytics}
                className="shrink-0 mt-0.5"
              />
            </div>

            {/* Marketing */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/40">
              <div>
                <Label htmlFor="marketing-toggle" className="text-sm font-medium text-foreground cursor-pointer">
                  Marketing
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Used to personalise product communications. Only activated with your consent.
                </p>
              </div>
              <Switch
                id="marketing-toggle"
                checked={marketing}
                onCheckedChange={setMarketing}
                className="shrink-0 mt-0.5"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" onClick={rejectNonEssential} className="text-xs">
              Reject non-essential
            </Button>
            <Button
              size="sm"
              className="text-xs bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => savePrefs(analytics, marketing)}
            >
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
