import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { VenueProvider, useVenue } from "@/lib/venue-context";
import { BrandProvider } from "@/lib/brand-context";
import { CookieProvider } from "@/lib/cookie-context";
import { CookieBanner } from "@/components/CookieBanner";
import { AppLayout } from "@/components/layout/AppLayout";

import Auth from "./pages/Auth";
import AuthReset from "./pages/AuthReset";
import InviteAccept from "./pages/InviteAccept";
import Landing from "./pages/Landing";
import CreateVenue from "./pages/CreateVenue";
import Home from "./pages/Home";
import Studio from "./pages/Studio";
import BrandBasics from "./pages/BrandBasics";
import BrandLibrary from "./pages/BrandLibrary";
import TheEditor from "./pages/TheEditor";
import VisualStyle from "./pages/VisualStyle";
import ReelCreator from "./pages/ReelCreator";
import ContentScheduler from "./pages/ContentScheduler";
import Copywriter from "./pages/Copywriter";
import Planner from "./pages/Planner";
import CompetitorIntel from "./pages/CompetitorIntel";
import BrandPerformance from "./pages/BrandPerformance";
import IndustryInsights from "./pages/growth/IndustryInsights";
import AIInsights from "./pages/AIInsights";
import Team from "./pages/Team";
import Integrations from "./pages/Integrations";
import Billing from "./pages/Billing";
import PlatformAdmin from "./pages/admin/PlatformAdmin";
import EventsPlanner from "./pages/EventsPlanner";
import EventPlanDetail from "./pages/EventPlanDetail";
import ReviewsAnalytics from "./pages/ReviewsAnalytics";
import ReferralDashboard from "./pages/growth/ReferralDashboard";
import PartnersPage from "./pages/growth/PartnersPage";
import OffersPage from "./pages/growth/OffersPage";
import ReferralsPage from "./pages/growth/ReferralsPage";
import PayoutsPage from "./pages/growth/PayoutsPage";
import PartnerDashboard from "./pages/partner/PartnerDashboard";
import PartnerOffers from "./pages/partner/PartnerOffers";
import PartnerLinks from "./pages/partner/PartnerLinks";
import PartnerReferrals from "./pages/partner/PartnerReferrals";
import PartnerEarnings from "./pages/partner/PartnerEarnings";
import PartnerProfile from "./pages/partner/PartnerProfile";
import { PartnerLayout } from "./components/partner/PartnerLayout";
import GuestSubmissions from "./pages/GuestSubmissions";
import GuestUploadPage from "./pages/GuestUploadPage";
import NotFound from "./pages/NotFound";
import TermsPage from "./pages/legal/Terms";
import PrivacyPage from "./pages/legal/Privacy";
import CookiePolicyPage from "./pages/legal/Cookies";

const queryClient = new QueryClient();

/**
 * Persistent authenticated layout — renders AppLayout once and uses <Outlet>
 * so the sidebar never remounts when navigating between protected pages.
 */
function ProtectedLayout() {
  const { user, loading } = useAuth();
  const { venues, loading: venueLoading, isDemoMode } = useVenue();

  if (loading || venueLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isDemoMode && venues.length > 0) {
    return (
      <AppLayout>
        <Outlet />
      </AppLayout>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (venues.length === 0) {
    return <Navigate to="/create-brand" replace />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/reset" element={<AuthReset />} />
      <Route path="/auth/invite" element={<InviteAccept />} />
      <Route path="/create-brand" element={<CreateVenue />} />

      {/* Redirect any signup attempts to landing */}
      <Route path="/signup" element={<Navigate to="/" replace />} />

      {/* Public guest upload page (no auth required) */}
      <Route path="/submit/:venueId" element={<GuestUploadPage />} />

      {/* All authenticated routes share a single persistent AppLayout */}
      <Route element={<ProtectedLayout />}>
        {/* Home - Default landing page */}
        <Route path="/home" element={<Home />} />
        
        {/* Studio Section - Creative workspace */}
        <Route path="/studio" element={<Studio />} />
        <Route path="/studio/pro-photo" element={<TheEditor />} />
        <Route path="/studio/reel-creator" element={<ReelCreator />} />
        <Route path="/studio/reels" element={<ReelCreator />} />
        
        {/* Content Section */}
        <Route path="/content/library" element={<BrandLibrary />} />
        <Route path="/content/planner" element={<Planner />} />
        <Route path="/content/planner/plan/:planId" element={<EventPlanDetail />} />
        <Route path="/content/scheduler" element={<ContentScheduler />} />
        <Route path="/content/campaigns" element={<Navigate to="/content/planner" replace />} />

        {/* Reputation Section */}
        <Route path="/reputation/reviews" element={<ReviewsAnalytics />} />

        {/* Growth Section */}
        <Route path="/growth/performance" element={<BrandPerformance />} />
        <Route path="/growth/industry-insights" element={<IndustryInsights />} />
        <Route path="/growth/referrals" element={<ReferralsPage />} />
        <Route path="/growth/partners" element={<PartnersPage />} />
        <Route path="/growth/payouts" element={<PayoutsPage />} />
        <Route path="/growth/offers" element={<OffersPage />} />

        {/* Venue Section */}
        <Route path="/venue/brand-basics" element={<BrandBasics />} />
        <Route path="/venue/visual-style" element={<VisualStyle />} />
        <Route path="/venue/integrations" element={<Integrations />} />
        <Route path="/venue/team" element={<Team />} />
        <Route path="/venue/guest-photos" element={<GuestSubmissions />} />

        {/* Admin Section */}
        <Route path="/admin/platform" element={<PlatformAdmin />} />
        <Route path="/admin/integrations" element={<Navigate to="/admin/platform" replace />} />

        {/* Legacy event planner redirects */}
        <Route path="/studio/events" element={<Navigate to="/content/planner" replace />} />
        <Route path="/studio/events/:planId" element={<Navigate to="/content/planner" replace />} />
        
        {/* Legacy analytics routes kept for deep links */}
        <Route path="/analytics/competitors" element={<CompetitorIntel />} />
        <Route path="/analytics/insights" element={<AIInsights />} />

        {/* ============ LEGACY REDIRECTS ============ */}
        {/* Style Engine → Visual Style */}
        <Route path="/studio/style-engine" element={<Navigate to="/venue/visual-style" replace />} />

        {/* Old Brand routes → New routes */}
        <Route path="/brand" element={<Navigate to="/home" replace />} />
        <Route path="/brand-overview" element={<Navigate to="/home" replace />} />
        <Route path="/brand/overview" element={<Navigate to="/home" replace />} />
        <Route path="/brand/identity" element={<Navigate to="/venue/brand-basics" replace />} />
        <Route path="/brand/library" element={<Navigate to="/content/library" replace />} />
        <Route path="/brand-kit" element={<Navigate to="/venue/brand-basics" replace />} />
        <Route path="/venue/profile" element={<Navigate to="/venue/brand-basics" replace />} />
        
        {/* Old Studio routes → New routes */}
        <Route path="/studio/editor" element={<Navigate to="/studio/pro-photo" replace />} />
        <Route path="/studio/content" element={<Navigate to="/content/planner" replace />} />
        <Route path="/editor" element={<Navigate to="/studio/pro-photo" replace />} />
        
        {/* Old Analytics routes → New routes */}
        <Route path="/analytics/reviews" element={<Navigate to="/reputation/reviews" replace />} />
        <Route path="/analytics/performance" element={<Navigate to="/growth/performance" replace />} />
        
        {/* Old Settings routes → New Venue routes */}
        <Route path="/settings/brand" element={<Navigate to="/venue/brand-basics" replace />} />
        <Route path="/settings/team" element={<Navigate to="/venue/team" replace />} />
        <Route path="/settings/integrations" element={<Navigate to="/venue/integrations" replace />} />
        <Route path="/settings/billing" element={<Billing />} />

        {/* Very old legacy redirects */}
        <Route path="/dashboard" element={<Navigate to="/home" replace />} />
        <Route path="/modules/editor" element={<Navigate to="/studio/pro-photo" replace />} />
        <Route path="/upload" element={<Navigate to="/studio/pro-photo" replace />} />
        <Route path="/drafts" element={<Navigate to="/studio/pro-photo" replace />} />
        <Route path="/publishing" element={<Navigate to="/studio/pro-photo" replace />} />
        <Route path="/studio/planner" element={<Navigate to="/content/planner" replace />} />
        <Route path="/studio/email" element={<Navigate to="/content/planner" replace />} />
        <Route path="/studio/competitors" element={<Navigate to="/analytics/competitors" replace />} />
        <Route path="/team" element={<Navigate to="/venue/team" replace />} />
        <Route path="/integrations" element={<Navigate to="/venue/integrations" replace />} />
        <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />
      </Route>

      {/* Partner Portal (separate layout, no venue sidebar) */}
      <Route path="/partner" element={<PartnerLayout><PartnerDashboard /></PartnerLayout>} />
      <Route path="/partner/offers" element={<PartnerLayout><PartnerOffers /></PartnerLayout>} />
      <Route path="/partner/links" element={<PartnerLayout><PartnerLinks /></PartnerLayout>} />
      <Route path="/partner/referrals" element={<PartnerLayout><PartnerReferrals /></PartnerLayout>} />
      <Route path="/partner/earnings" element={<PartnerLayout><PartnerEarnings /></PartnerLayout>} />
      <Route path="/partner/profile" element={<PartnerLayout><PartnerProfile /></PartnerLayout>} />

      {/* Legal pages */}
      <Route path="/legal/terms" element={<TermsPage />} />
      <Route path="/legal/privacy" element={<PrivacyPage />} />
      <Route path="/legal/cookies" element={<CookiePolicyPage />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <CookieProvider>
          <AuthProvider>
            <VenueProvider>
              <BrandProvider>
                <AppRoutes />
                <CookieBanner />
              </BrandProvider>
            </VenueProvider>
          </AuthProvider>
        </CookieProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);


export default App;
