import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './auth-context';

interface Venue {
  id: string;
  name: string;
  plan: string;
  created_at: string;
}

interface VenueMember {
  id: string;
  venue_id: string;
  user_id: string;
  role: 'admin' | 'staff';
}

interface VenueContextType {
  venues: Venue[];
  currentVenue: Venue | null;
  currentMember: VenueMember | null;
  setCurrentVenue: (venue: Venue | null) => void;
  loading: boolean;
  isAdmin: boolean;
  isDemoMode: boolean;
  refreshVenues: () => Promise<void>;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

// Demo venue ID for sample data viewing
const DEMO_VENUE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

export function VenueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [currentVenue, setCurrentVenue] = useState<Venue | null>(null);
  const [currentMember, setCurrentMember] = useState<VenueMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const loadDemoVenue = async () => {
    try {
      const { data: venue, error } = await supabase
        .from('venues')
        .select('*')
        .eq('id', DEMO_VENUE_ID)
        .single();

      if (error || !venue) {
        setLoading(false);
        return;
      }

      setVenues([venue]);
      setCurrentVenue(venue);
      setCurrentMember({
        id: 'demo-member',
        venue_id: DEMO_VENUE_ID,
        user_id: 'demo-user',
        role: 'admin',
      });
      setIsDemoMode(true);
    } catch (error) {
      console.error('Error loading demo venue:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshVenues = async () => {
    if (!user) {
      // Load demo venue for preview purposes
      await loadDemoVenue();
      return;
    }

    setIsDemoMode(false);

    try {
      // Get all venue memberships for this user
      const { data: memberships, error: memberError } = await supabase
        .from('venue_members')
        .select('venue_id, role, id, user_id')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      if (memberships && memberships.length > 0) {
        // Get venue details
        const venueIds = memberships.map(m => m.venue_id);
        const { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select('*')
          .in('id', venueIds);

        if (venueError) throw venueError;

        setVenues(venueData || []);

        // Set current venue if not set or invalid
        if (venueData && venueData.length > 0) {
          const storedVenueId = localStorage.getItem('currentVenueId');
          const stored = venueData.find(v => v.id === storedVenueId);
          const venue = stored || venueData[0];
          setCurrentVenue(venue);
          
          // Find the membership for current venue
          const member = memberships.find(m => m.venue_id === venue.id);
          setCurrentMember(member as VenueMember || null);
        }
      } else {
        setVenues([]);
        setCurrentVenue(null);
        setCurrentMember(null);
      }
    } catch (error) {
      console.error('Error fetching venues:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshVenues();
  }, [user]);

  useEffect(() => {
    if (currentVenue) {
      localStorage.setItem('currentVenueId', currentVenue.id);
    }
  }, [currentVenue]);

  const isAdmin = currentMember?.role === 'admin';

  return (
    <VenueContext.Provider value={{
      venues,
      currentVenue,
      currentMember,
      setCurrentVenue,
      loading,
      isAdmin,
      isDemoMode,
      refreshVenues,
    }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenue() {
  const context = useContext(VenueContext);
  if (context === undefined) {
    throw new Error('useVenue must be used within a VenueProvider');
  }
  return context;
}
