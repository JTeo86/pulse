import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './auth-context';

interface Venue {
  id: string;
  name: string;
  plan: string;
  created_at: string;
  owner_user_id?: string | null;
}

interface VenueMember {
  id: string;
  venue_id: string;
  user_id: string;
  role: 'staff' | 'manager';
}

interface VenueContextType {
  venues: Venue[];
  currentVenue: Venue | null;
  currentMember: VenueMember | null;
  setCurrentVenue: (venue: Venue | null) => void;
  loading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isDemoMode: boolean;
  refreshVenues: () => Promise<void>;
}

const VenueContext = createContext<VenueContextType | undefined>(undefined);

// Demo venue ID for sample data viewing
const DEMO_VENUE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

export function VenueProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
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

      setVenues([venue as Venue]);
      setCurrentVenue(venue as Venue);
      setCurrentMember({
        id: 'demo-member',
        venue_id: DEMO_VENUE_ID,
        user_id: 'demo-user',
        role: 'manager',
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
      await loadDemoVenue();
      return;
    }

    setIsDemoMode(false);

    try {
      // Auto-accept any pending venue invites for this user's email
      await supabase.rpc('accept_venue_invites');

      // Get all venue memberships for this user
      const { data: memberships, error: memberError } = await supabase
        .from('venue_members')
        .select('venue_id, role, id, user_id')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      // Also check venues where user is owner (may not be a member if just created)
      const { data: ownedVenues, error: ownedError } = await supabase
        .from('venues')
        .select('*')
        .eq('owner_user_id', user.id);

      if (ownedError) throw ownedError;

      const memberVenueIds = (memberships || []).map(m => m.venue_id);

      if (memberships && memberships.length > 0) {
        const { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select('*')
          .in('id', memberVenueIds);

        if (venueError) throw venueError;

        // Merge with owned venues
        const allVenueMap = new Map<string, Venue>();
        (venueData || []).forEach(v => allVenueMap.set(v.id, v as Venue));
        (ownedVenues || []).forEach(v => allVenueMap.set(v.id, v as Venue));
        const allVenues = Array.from(allVenueMap.values());

        setVenues(allVenues);

        if (allVenues.length > 0) {
          const storedVenueId = localStorage.getItem('currentVenueId');
          const stored = allVenues.find(v => v.id === storedVenueId);
          const venue = stored || allVenues[0];
          setCurrentVenue(venue);

          const member = memberships.find(m => m.venue_id === venue.id);
          setCurrentMember(member as VenueMember || null);
        }
        setLoading(false);
      } else if (ownedVenues && ownedVenues.length > 0) {
        // User is owner but not yet a member (rare edge case)
        setVenues(ownedVenues as Venue[]);
        const venue = ownedVenues[0] as Venue;
        setCurrentVenue(venue);
        setCurrentMember(null);
        setLoading(false);
      } else {
        await loadDemoVenue();
      }
    } catch (error) {
      console.error('Error fetching venues:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    refreshVenues();
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (currentVenue) {
      localStorage.setItem('currentVenueId', currentVenue.id);
    }
  }, [currentVenue]);

  // Owner is determined by venues.owner_user_id
  const isOwner = !!(user && currentVenue?.owner_user_id === user.id);
  // isAdmin: owner is always admin; also treat as admin if no member record but is owner
  const isAdmin = isOwner || currentMember?.role === 'manager';

  return (
    <VenueContext.Provider value={{
      venues,
      currentVenue,
      currentMember,
      setCurrentVenue,
      loading,
      isAdmin,
      isOwner,
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
