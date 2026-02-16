import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { VenueProvider, useVenue } from "@/lib/venue-context";
import { BrandProvider } from "@/lib/brand-context";

import Auth from "./pages/Auth";
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
import EventPlanDetail from "./pages/EventPlanDetail";
import ReviewsAnalytics from "./pages/ReviewsAnalytics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (venues.length === 0) {
    return <Navigate to="/create-brand" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/create-brand" element={<CreateVenue />} />
      <Route path="/" element={<Navigate to="/studio/editor" replace />} />
      
      {/* Brand Section */}
      <Route path="/brand/overview" element={<ProtectedRoute><BrandOverview /></ProtectedRoute>} />
      <Route path="/brand/identity" element={<ProtectedRoute><BrandKit /></ProtectedRoute>} />
      <Route path="/brand/library" element={<ProtectedRoute><BrandLibrary /></ProtectedRoute>} />
      
      {/* Studio Section */}
      <Route path="/studio/editor" element={<ProtectedRoute><TheEditor /></ProtectedRoute>} />
      <Route path="/studio/content" element={<ProtectedRoute><Copywriter /></ProtectedRoute>} />
      <Route path="/studio/events" element={<ProtectedRoute><EventsPlanner /></ProtectedRoute>} />
      <Route path="/studio/events/:planId" element={<ProtectedRoute><EventPlanDetail /></ProtectedRoute>} />
      
      {/* Analytics Section */}
      <Route path="/analytics/performance" element={<ProtectedRoute><BrandPerformance /></ProtectedRoute>} />
      <Route path="/analytics/competitors" element={<ProtectedRoute><CompetitorIntel /></ProtectedRoute>} />
      <Route path="/analytics/insights" element={<ProtectedRoute><AIInsights /></ProtectedRoute>} />
      <Route path="/analytics/reviews" element={<ProtectedRoute><ReviewsAnalytics /></ProtectedRoute>} />
      
      {/* Settings Section */}
      <Route path="/settings/brand" element={<ProtectedRoute><BrandSettings /></ProtectedRoute>} />
      <Route path="/settings/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
      <Route path="/settings/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
      <Route path="/admin/platform" element={<ProtectedRoute><PlatformAdmin /></ProtectedRoute>} />
      <Route path="/settings/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
      
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
        <AuthProvider>
          <VenueProvider>
            <BrandProvider>
              <AppRoutes />
            </BrandProvider>
          </VenueProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
