import { Link } from 'react-router-dom';
import { SiteFooter } from '@/components/SiteFooter';

const LAST_UPDATED = '20 February 2026';

export default function PrivacyPage() {
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
          <h1 className="font-serif text-4xl font-medium text-foreground mb-3">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        <nav className="card-elevated p-5 mb-12 space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">Contents</p>
          {[
            ['1', 'Who We Are'],
            ['2', 'Data We Collect'],
            ['3', 'How We Use Your Data'],
            ['4', 'Lawful Bases for Processing'],
            ['5', 'Data Retention'],
            ['6', 'Third-Party Processors'],
            ['7', 'International Transfers'],
            ['8', 'Your Rights'],
            ['9', 'Contact & Complaints'],
          ].map(([n, title]) => (
            <a key={n} href={`#section-${n}`} className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-0.5">
              {n}. {title}
            </a>
          ))}
        </nav>

        <div className="space-y-10 text-sm leading-relaxed">
          <section id="section-1">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">1. Who We Are</h2>
            <p className="text-muted-foreground">
              Pulse ("we", "us", "our") is the controller of your personal data. We operate an AI-powered marketing intelligence platform for hospitality venues.
            </p>
            <p className="text-muted-foreground mt-3">
              {/* UPDATE with company name and registration number before launch */}
              Registered company: <span className="italic text-muted-foreground/70">[Company name and registration — update before launch]</span>, England & Wales.
            </p>
            <p className="text-muted-foreground mt-3">
              Contact: <a href="mailto:privacy@pulsehq.ai" className="hover:text-foreground transition-colors">privacy@pulsehq.ai</a>
            </p>
          </section>

          <section id="section-2">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">2. Data We Collect</h2>
            <div className="space-y-4 text-muted-foreground">
              <div>
                <p className="font-medium text-foreground mb-1">Account data</p>
                <p>Email address, password (hashed), and account creation date when you register.</p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">Venue data</p>
                <p>Venue name, location, and settings you provide to configure your workspace.</p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">Content and uploads</p>
                <p>Photos, brand assets, copy drafts, and other content you upload or generate through the platform.</p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">Usage data</p>
                <p>Feature interactions, session data, and error logs to help us maintain and improve the Service.</p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">Communications</p>
                <p>Messages you send to our support team.</p>
              </div>
            </div>
          </section>

          <section id="section-3">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">3. How We Use Your Data</h2>
            <ul className="space-y-2 text-muted-foreground list-disc list-inside">
              <li>To provide, operate, and maintain the Service.</li>
              <li>To authenticate your identity and secure your account.</li>
              <li>To send transactional emails (e.g. invitations, password resets).</li>
              <li>To analyse usage patterns and improve platform features.</li>
              <li>To respond to support requests.</li>
              <li>To comply with legal obligations.</li>
              <li>With your consent: to send marketing communications about Pulse.</li>
            </ul>
          </section>

          <section id="section-4">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">4. Lawful Bases for Processing</h2>
            <div className="space-y-3 text-muted-foreground">
              <p><span className="font-medium text-foreground">Contract:</span> Processing necessary to deliver the Service you've signed up for (account management, feature delivery).</p>
              <p><span className="font-medium text-foreground">Legitimate interests:</span> Security monitoring, fraud prevention, and product improvement — balanced against your rights.</p>
              <p><span className="font-medium text-foreground">Legal obligation:</span> Retaining certain records as required by law.</p>
              <p><span className="font-medium text-foreground">Consent:</span> Analytics and marketing cookies, and marketing emails, where you have opted in.</p>
            </div>
          </section>

          <section id="section-5">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">5. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your personal data for as long as your account is active, or as needed to provide the Service. On account deletion we will remove personal data within 30 days, unless retention is required by law or for legitimate business purposes (e.g. financial records).
            </p>
          </section>

          <section id="section-6">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">6. Third-Party Processors</h2>
            <p className="text-muted-foreground mb-3">We share data with the following categories of processors under data processing agreements:</p>
            <div className="space-y-2 text-muted-foreground">
              <p><span className="font-medium text-foreground">Infrastructure &amp; database:</span> Supabase (EU/US hosting; covered by DPA and SCCs where applicable).</p>
              <p><span className="font-medium text-foreground">AI model providers:</span> OpenAI, Google (used to generate content; see their respective privacy policies).</p>
              <p><span className="font-medium text-foreground">Email delivery:</span> Supabase Auth email (transactional notifications only).</p>
              <p><span className="font-medium text-foreground">Payment processing:</span> Stripe (if applicable; subject to Stripe's Privacy Policy).</p>
            </div>
            <p className="text-muted-foreground mt-3">We do not sell your personal data to third parties.</p>
          </section>

          <section id="section-7">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">7. International Transfers</h2>
            <p className="text-muted-foreground">
              Some of our processors are based outside the UK and EEA. Where data is transferred internationally, we rely on appropriate safeguards including Standard Contractual Clauses (SCCs) and adequacy decisions where available. Contact us for details of specific transfer mechanisms.
            </p>
          </section>

          <section id="section-8">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">8. Your Rights</h2>
            <p className="text-muted-foreground mb-3">Under UK GDPR and, where applicable, the EU GDPR, you have the right to:</p>
            <ul className="space-y-2 text-muted-foreground list-disc list-inside">
              <li><span className="font-medium text-foreground">Access</span> — obtain a copy of your personal data.</li>
              <li><span className="font-medium text-foreground">Rectification</span> — correct inaccurate data.</li>
              <li><span className="font-medium text-foreground">Erasure</span> — request deletion ("right to be forgotten") where applicable.</li>
              <li><span className="font-medium text-foreground">Restriction</span> — limit processing in certain circumstances.</li>
              <li><span className="font-medium text-foreground">Portability</span> — receive your data in a structured, machine-readable format.</li>
              <li><span className="font-medium text-foreground">Object</span> — object to processing based on legitimate interests.</li>
              <li><span className="font-medium text-foreground">Withdraw consent</span> — at any time, without affecting prior lawful processing.</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              To exercise any right, contact us at <a href="mailto:privacy@pulsehq.ai" className="hover:text-foreground transition-colors">privacy@pulsehq.ai</a>. We will respond within one month.
            </p>
          </section>

          <section id="section-9">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">9. Contact & Complaints</h2>
            <p className="text-muted-foreground">
              For privacy queries: <a href="mailto:privacy@pulsehq.ai" className="hover:text-foreground transition-colors">privacy@pulsehq.ai</a>
            </p>
            <p className="text-muted-foreground mt-3">
              If you believe we have not handled your data lawfully, you have the right to lodge a complaint with the Information Commissioner's Office (ICO) in the UK at{' '}
              <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">ico.org.uk</a>, or with the relevant supervisory authority in your EU member state.
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
