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
import BrandOverview from "./pages/BrandOverview";
import BrandKit from "./pages/BrandKit";
import BrandLibrary from "./pages/BrandLibrary";
import TheEditor from "./pages/TheEditor";
import Copywriter from "./pages/Copywriter";
import CompetitorIntel from "./pages/CompetitorIntel";
import BrandPerformance from "./pages/BrandPerformance";
import AIInsights from "./pages/AIInsights";
import BrandSettings from "./pages/BrandSettings";
import Team from "./pages/Team";
import Integrations from "./pages/Integrations";
import Billing from "./pages/Billing";
import PlatformAdmin from "./pages/admin/PlatformAdmin";
import EventsPlanner from "./pages/EventsPlanner";
import EditorPage from "./pages/Editor";
import EventPlanDetail from "./pages/EventPlanDetail";
import ReviewsAnalytics from "./pages/ReviewsAnalytics";
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

      {/* All authenticated routes share a single persistent AppLayout */}
      <Route element={<ProtectedLayout />}>
        {/* Brand Section */}
        <Route path="/brand/overview" element={<BrandOverview />} />
        <Route path="/brand/identity" element={<BrandKit />} />
        <Route path="/brand/library" element={<BrandLibrary />} />

        {/* Studio Section */}
        <Route path="/studio/editor" element={<TheEditor />} />
        <Route path="/studio/content" element={<Copywriter />} />
        <Route path="/studio/events" element={<EventsPlanner />} />
        <Route path="/studio/events/:planId" element={<EventPlanDetail />} />

        {/* Analytics Section */}
        <Route path="/analytics/performance" element={<BrandPerformance />} />
        <Route path="/analytics/competitors" element={<CompetitorIntel />} />
        <Route path="/analytics/insights" element={<AIInsights />} />
        <Route path="/analytics/reviews" element={<ReviewsAnalytics />} />

        {/* Settings Section */}
        <Route path="/settings/brand" element={<BrandSettings />} />
        <Route path="/settings/team" element={<Team />} />
        <Route path="/settings/integrations" element={<Integrations />} />
        <Route path="/settings/billing" element={<Billing />} />

        {/* Admin Section */}
        <Route path="/admin/platform" element={<PlatformAdmin />} />
        <Route path="/admin/integrations" element={<Navigate to="/admin/platform" replace />} />

        {/* Editor */}
        <Route path="/editor" element={<EditorPage />} />

        {/* Legacy redirects */}
        <Route path="/dashboard" element={<Navigate to="/brand/overview" replace />} />
        <Route path="/brand-kit" element={<Navigate to="/brand/identity" replace />} />
        <Route path="/modules/editor" element={<Navigate to="/studio/editor" replace />} />
        <Route path="/upload" element={<Navigate to="/studio/editor" replace />} />
        <Route path="/drafts" element={<Navigate to="/studio/editor" replace />} />
        <Route path="/publishing" element={<Navigate to="/studio/editor" replace />} />
        <Route path="/studio/planner" element={<Navigate to="/settings/integrations" replace />} />
        <Route path="/studio/email" element={<Navigate to="/studio/content" replace />} />
        <Route path="/studio/competitors" element={<Navigate to="/analytics/competitors" replace />} />
        <Route path="/team" element={<Navigate to="/settings/team" replace />} />
        <Route path="/integrations" element={<Navigate to="/settings/integrations" replace />} />
        <Route path="/billing" element={<Navigate to="/settings/billing" replace />} />
      </Route>

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
