import { Link } from 'react-router-dom';
import { useCookies } from '@/lib/cookie-context';

interface SiteFooterProps {
  className?: string;
}

export function SiteFooter({ className = '' }: SiteFooterProps) {
  const { openModal } = useCookies();

  return (
    <footer className={`border-t border-border/40 py-8 px-6 ${className}`}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <span className="font-serif text-base font-medium text-foreground">
            Pulse<span className="text-accent">.</span>
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">AI Marketing Intelligence for Hospitality</p>
        </div>
        <nav className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <Link to="/legal/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link to="/legal/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/legal/cookies" className="hover:text-foreground transition-colors">Cookie Policy</Link>
          <button
            onClick={openModal}
            className="hover:text-foreground transition-colors cursor-pointer"
          >
            Cookie Settings
          </button>
          <a href="mailto:support@pulsehq.ai" className="hover:text-foreground transition-colors">Contact</a>
          <span className="text-border">·</span>
          <span>© {new Date().getFullYear()} Pulse</span>
        </nav>
      </div>
    </footer>
  );
}
