import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_FALLBACK_PATH = '/';

export default function ReferralRedirect() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    const resolveReferral = async () => {
      if (!slug) {
        window.location.replace(DEFAULT_FALLBACK_PATH);
        return;
      }

      const { data: partner } = await (supabase as any)
        .from('referrers')
        .select('id, venue_id, referral_code, referral_slug, referral_active, venues(website_url)')
        .eq('referral_slug', slug)
        .maybeSingle();

      if (!partner || !partner.referral_active) {
        window.location.replace(DEFAULT_FALLBACK_PATH);
        return;
      }

      const destination =
        (partner.venues as { website_url?: string | null } | null)?.website_url ||
        DEFAULT_FALLBACK_PATH;

      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

      await (supabase as any).from('partner_referral_clicks').insert({
        partner_id: partner.id,
        venue_id: partner.venue_id,
        referral_code: partner.referral_code,
        destination_url: destination,
        user_agent: userAgent,
      });

      window.location.replace(destination);
    };

    resolveReferral();
  }, [slug]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Taking you to the venue…</p>
    </div>
  );
}
