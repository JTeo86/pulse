import { Link } from 'react-router-dom';
import { SiteFooter } from '@/components/SiteFooter';
import { useCookies } from '@/lib/cookie-context';
import { Button } from '@/components/ui/button';

const LAST_UPDATED = '20 February 2026';

export default function CookiePolicyPage() {
  const { openModal } = useCookies();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <nav className="border-b border-border/50 bg-background/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="font-serif text-lg font-medium">Pulse<span className="text-accent">.</span></Link>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign In</Link>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-16 w-full">
        <div className="mb-12">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Legal</p>
          <h1 className="font-serif text-4xl font-medium text-foreground mb-3">Cookie Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">What are cookies?</h2>
            <p className="text-muted-foreground">
              Cookies are small text files placed on your device when you visit a website. They help websites remember your preferences, maintain sessions, and collect usage information. Pulse also uses similar technologies such as localStorage for storing your cookie preferences themselves.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">Categories of cookies we use</h2>

            {/* Necessary */}
            <div className="card-elevated p-5 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Necessary</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Always active — cannot be disabled</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 shrink-0">Required</span>
              </div>
              <p className="text-muted-foreground mt-3">
                These cookies are essential for Pulse to function. They handle your authentication session, keep you logged in, and protect the platform from cross-site request forgery (CSRF) attacks. Without them, the platform cannot operate.
              </p>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Examples:</span> Authentication session tokens (Supabase Auth), CSRF protection cookies.</p>
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Duration:</span> Session or up to 7 days.</p>
              </div>
            </div>

            {/* Analytics */}
            <div className="card-elevated p-5 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Analytics</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Optional — requires your consent</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/20 shrink-0">Optional</span>
              </div>
              <p className="text-muted-foreground mt-3">
                Analytics cookies help us understand how Pulse is used — which features are popular, where users encounter issues, and how to improve the platform. No personally identifiable data is sold or shared with advertising networks.
              </p>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Examples:</span> Usage event tracking (currently not active; infrastructure is ready for future activation).</p>
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Duration:</span> Varies by provider; typically up to 2 years.</p>
              </div>
            </div>

            {/* Marketing */}
            <div className="card-elevated p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Marketing</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Optional — requires your consent</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 shrink-0">Optional</span>
              </div>
              <p className="text-muted-foreground mt-3">
                Marketing cookies allow us to personalise communications about Pulse features and relevant offers. These are only activated when you explicitly consent and are not currently active in our beta.
              </p>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Examples:</span> Product retargeting and email preference tracking (not yet active).</p>
                <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Duration:</span> Varies by provider.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">How we store your preferences</h2>
            <p className="text-muted-foreground">
              Your cookie preferences are stored in your browser's <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">localStorage</code> under the key <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">pulse_cookie_prefs</code>. This is a local record that does not leave your device unless you interact with features that require it.
            </p>
            <p className="text-muted-foreground mt-3">
              If you clear your browser data or localStorage, your preferences will be reset and the banner will reappear.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">How to manage your cookie preferences</h2>
            <p className="text-muted-foreground mb-4">
              You can update your cookie preferences at any time using the button below, or via the Cookie Settings link in the footer of any page.
            </p>
            <Button
              onClick={openModal}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              size="sm"
            >
              Open Cookie Settings
            </Button>
            <p className="text-muted-foreground mt-4">
              You can also control cookies at the browser level. Please note that blocking all cookies may affect your ability to sign in or use some features of Pulse. See your browser's help documentation for instructions.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">Third-party cookies</h2>
            <p className="text-muted-foreground">
              Some cookies may be set by third-party services embedded in Pulse (such as our infrastructure provider). We have no control over these cookies directly, but we aim to minimise third-party cookie usage and disclose it here when present.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">Contact</h2>
            <p className="text-muted-foreground">
              For questions about our use of cookies, contact us at{' '}
              <a href="mailto:privacy@pulsehq.ai" className="hover:text-foreground transition-colors">privacy@pulsehq.ai</a>.
            </p>
          </section>

          <div className="border-t border-border/40 pt-8">
            <p className="text-xs text-muted-foreground italic">
              This document is informational and should be reviewed by qualified legal counsel before reliance.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
