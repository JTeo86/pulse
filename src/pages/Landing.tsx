import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true } as const,
  transition: { duration: 0.6 },
};

const features = [
  {
    title: 'AI Marketing Assistant',
    body: 'Stay ahead of upcoming events and opportunities. Pulse highlights what matters and recommends when to plan, promote, or skip.',
  },
  {
    title: 'AI Content Engine',
    body: 'Generate emails, campaigns, social posts and promotional content aligned with your brand identity.',
  },
  {
    title: 'Brand Intelligence',
    body: 'Centralise your visual identity, messaging, and tone to ensure every output stays consistent.',
  },
  {
    title: 'Review Monitoring & Insight',
    body: 'Track guest feedback, identify trends, and surface operational and marketing insights automatically.',
  },
];

export default function Landing() {
  const [email, setEmail] = useState('');
  const [venueName, setVenueName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('waitlist_signups')
        .insert({ email: email.trim(), venue_name: venueName.trim() || null });
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Something went wrong',
        description: err?.message || 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-serif text-xl font-medium">Pulse<span className="text-accent">.</span></span>
          <Link
            to="/auth"
            className="px-5 py-2 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div {...fadeUp}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground mb-10 tracking-widest uppercase">
              Private Beta
            </div>
            <h1 className="font-serif text-5xl md:text-7xl font-medium leading-tight tracking-tight text-foreground mb-8">
              Marketing Intelligence<br />for Hospitality.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-12">
              Pulse is your AI-powered marketing assistant, content engine, and review intelligence platform — built specifically for restaurants, bars, cafés, and hospitality groups.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/auth"
                className="px-8 py-3.5 rounded-md font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors text-sm"
              >
                Sign In
              </Link>
              <a
                href="#waitlist"
                className="px-8 py-3.5 rounded-md font-medium border border-border text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-colors text-sm"
              >
                Join Waitlist
              </a>
            </div>
            <p className="mt-5 text-xs text-muted-foreground tracking-wide">Currently in private beta.</p>
          </motion.div>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-border/40" />

      {/* Problem */}
      <section className="py-28 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div {...fadeUp}>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">The Problem</p>
            <h2 className="font-serif text-4xl md:text-5xl font-medium leading-tight mb-12 text-foreground">
              Hospitality teams are reactive.
            </h2>
            <ul className="space-y-5">
              {[
                'Campaigns planned too late.',
                'Reviews monitored inconsistently.',
                'Content created ad-hoc.',
                'Brand messaging diluted over time.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-4 text-muted-foreground text-lg">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-12 text-xl text-foreground/70 font-serif italic">
              Marketing shouldn't feel chaotic.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="border-t border-border/40" />

      {/* Solution */}
      <section className="py-28 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div {...fadeUp}>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">The Solution</p>
            <h2 className="font-serif text-4xl md:text-5xl font-medium leading-tight mb-8 text-foreground">
              Meet Pulse.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Pulse acts as your AI marketing intelligence layer — helping venues stay ahead of key dates, generate on-brand content, and turn guest feedback into actionable insight.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="border-t border-border/40" />

      {/* Features */}
      <section className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp} className="mb-16">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Capabilities</p>
            <h2 className="font-serif text-4xl font-medium text-foreground">Everything in one layer.</h2>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-px border border-border/40 rounded-xl overflow-hidden">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-card p-8 border-b border-r border-border/40 last:border-b-0"
              >
                <div className="w-1 h-6 rounded-full bg-accent mb-6" />
                <h3 className="font-serif text-xl font-medium text-foreground mb-3">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="border-t border-border/40" />

      {/* Private Beta + Waitlist */}
      <section id="waitlist" className="py-28 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div {...fadeUp}>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">Access</p>
            <h2 className="font-serif text-4xl md:text-5xl font-medium leading-tight mb-6 text-foreground">
              Currently in Private Beta
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-12">
              Pulse is available to a limited number of hospitality venues as we refine the platform.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
              <Link
                to="/auth"
                className="px-8 py-3.5 rounded-md font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors text-sm"
              >
                Sign In
              </Link>
            </div>

            <div className="border-t border-border/40 pt-12">
              <p className="text-sm text-muted-foreground mb-8">Request early access. We'll notify you when Pulse is ready for your venue.</p>

              {submitted ? (
                <div className="py-8">
                  <p className="text-foreground font-medium">Thank you.</p>
                  <p className="text-muted-foreground text-sm mt-2">We'll notify you when Pulse launches.</p>
                </div>
              ) : (
                <form onSubmit={handleWaitlist} className="space-y-4 text-left">
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Email address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@venue.com"
                      className="w-full bg-card border border-border rounded-md px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/60 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Venue name <span className="normal-case tracking-normal opacity-50">(optional)</span></label>
                    <input
                      type="text"
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      placeholder="The Grand, Soho House..."
                      className="w-full bg-card border border-border rounded-md px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/60 transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-md text-sm font-medium border border-border text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Join Waitlist'}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="font-serif text-lg font-medium">Pulse<span className="text-accent">.</span></span>
            <p className="text-xs text-muted-foreground mt-1">AI Marketing Intelligence for Hospitality</p>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="mailto:hello@pulsehq.ai" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
