import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { VenueProvider, useVenue } from "@/lib/venue-context";

import Auth from "./pages/Auth";
import CreateVenue from "./pages/CreateVenue";
import Dashboard from "./pages/Dashboard";
import BrandKit from "./pages/BrandKit";
import Upload from "./pages/Upload";
import Drafts from "./pages/Drafts";
import Publishing from "./pages/Publishing";
import Team from "./pages/Team";
import Integrations from "./pages/Integrations";
import Billing from "./pages/Billing";
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

  // Allow demo mode to bypass auth
  if (isDemoMode && venues.length > 0) {
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (venues.length === 0) {
    return <Navigate to="/create-venue" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/create-venue" element={<CreateVenue />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/brand-kit" element={<ProtectedRoute><BrandKit /></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
      <Route path="/drafts" element={<ProtectedRoute><Drafts /></ProtectedRoute>} />
      <Route path="/publishing" element={<ProtectedRoute><Publishing /></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
      <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
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
            <AppRoutes />
          </VenueProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
