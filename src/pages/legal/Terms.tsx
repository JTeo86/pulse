import { Link } from 'react-router-dom';
import { SiteFooter } from '@/components/SiteFooter';

const LAST_UPDATED = '20 February 2026';

export default function TermsPage() {
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
          <h1 className="font-serif text-4xl font-medium text-foreground mb-3">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>

        {/* ToC */}
        <nav className="card-elevated p-5 mb-12 space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">Contents</p>
          {[
            ['1', 'Description of Service'],
            ['2', 'Accounts and Responsibilities'],
            ['3', 'Acceptable Use'],
            ['4', 'Subscription and Payment'],
            ['5', 'Intellectual Property'],
            ['6', 'Disclaimer and Limitation of Liability'],
            ['7', 'Termination'],
            ['8', 'Governing Law'],
          ].map(([n, title]) => (
            <a key={n} href={`#section-${n}`} className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-0.5">
              {n}. {title}
            </a>
          ))}
        </nav>

        <div className="prose-like space-y-10 text-sm leading-relaxed">
          <section id="section-1">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">1. Description of Service</h2>
            <p className="text-muted-foreground">
              Pulse ("we", "us", "our") provides an AI-powered marketing intelligence platform designed for hospitality venues including restaurants, bars, cafés, and hospitality groups. The platform includes features such as AI marketing assistance, content generation, brand management, competitor intelligence, and review monitoring (collectively, the "Service").
            </p>
            <p className="text-muted-foreground mt-3">
              By accessing or using the Service, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, please do not use the Service.
            </p>
          </section>

          <section id="section-2">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">2. Accounts and Responsibilities</h2>
            <p className="text-muted-foreground">
              To access most features, you must create an account. You are responsible for:
            </p>
            <ul className="mt-3 space-y-2 text-muted-foreground list-disc list-inside">
              <li>Maintaining the confidentiality of your login credentials.</li>
              <li>All activity that occurs under your account.</li>
              <li>Ensuring that all team members invited to your workspace comply with these Terms.</li>
              <li>Providing accurate and up-to-date information during registration.</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              You must be at least 18 years old to use the Service.
            </p>
          </section>

          <section id="section-3">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">3. Acceptable Use</h2>
            <p className="text-muted-foreground">You agree not to:</p>
            <ul className="mt-3 space-y-2 text-muted-foreground list-disc list-inside">
              <li>Use the Service for any unlawful purpose or in violation of applicable laws or regulations.</li>
              <li>Upload or share content that is defamatory, obscene, or infringes third-party rights.</li>
              <li>Attempt to reverse engineer, decompile, or disassemble any part of the Service.</li>
              <li>Use automated tools to scrape or extract data from the Service without written permission.</li>
              <li>Interfere with the security or integrity of the Service.</li>
              <li>Misrepresent your identity or affiliation with any venue or organisation.</li>
            </ul>
          </section>

          <section id="section-4">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">4. Subscription and Payment</h2>
            <p className="text-muted-foreground">
              Pulse is currently offered in private beta. Subscription pricing, billing cycles, and payment terms will be communicated to you before any paid plan is activated. Where applicable:
            </p>
            <ul className="mt-3 space-y-2 text-muted-foreground list-disc list-inside">
              <li>Fees are charged in advance on a monthly or annual basis.</li>
              <li>Refunds are at our discretion and subject to our refund policy communicated at time of purchase.</li>
              <li>We reserve the right to change pricing with reasonable notice (typically 30 days).</li>
            </ul>
          </section>

          <section id="section-5">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">5. Intellectual Property</h2>
            <p className="text-muted-foreground">
              All intellectual property rights in the Service, including software, design, trademarks, and content created by Pulse, remain the exclusive property of Pulse and its licensors.
            </p>
            <p className="text-muted-foreground mt-3">
              You retain ownership of content you upload to the platform ("Your Content"). By uploading content, you grant us a limited, non-exclusive licence to use it solely to provide the Service to you.
            </p>
            <p className="text-muted-foreground mt-3">
              AI-generated outputs are provided for your use as part of the Service. Responsibility for the accuracy and appropriateness of AI-generated content rests with you.
            </p>
          </section>

          <section id="section-6">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">6. Disclaimer and Limitation of Liability</h2>
            <p className="text-muted-foreground">
              The Service is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or meet your specific requirements.
            </p>
            <p className="text-muted-foreground mt-3">
              To the fullest extent permitted by law, Pulse shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, even if we have been advised of the possibility of such damages.
            </p>
            <p className="text-muted-foreground mt-3">
              Our total liability to you for direct damages shall not exceed the fees paid by you in the 12 months preceding the claim.
            </p>
          </section>

          <section id="section-7">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">7. Termination</h2>
            <p className="text-muted-foreground">
              You may cancel your account at any time by contacting us. We may suspend or terminate your access to the Service at our discretion if you breach these Terms or if continued provision of the Service is no longer commercially viable or technically feasible.
            </p>
            <p className="text-muted-foreground mt-3">
              Upon termination, your right to use the Service ceases immediately. We may retain certain data as required by law or for legitimate business purposes.
            </p>
          </section>

          <section id="section-8">
            <h2 className="font-serif text-xl font-medium text-foreground mb-4">8. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms are governed by and construed in accordance with the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
            <p className="text-muted-foreground mt-3">
              If you are a consumer based in the EU, you may also have rights under the consumer protection laws of your country of residence.
            </p>
          </section>

          <div className="border-t border-border/40 pt-8">
            <p className="text-xs text-muted-foreground italic">
              For questions about these Terms, contact us at{' '}
              <a href="mailto:support@pulsehq.ai" className="hover:text-foreground transition-colors">support@pulsehq.ai</a>.
              {' '}This document is informational and should be reviewed by qualified legal counsel before reliance.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
