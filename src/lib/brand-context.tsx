/**
 * Brand Context - UI wrapper around venue context
 * Provides "Brand" terminology while maintaining existing venue infrastructure
 */

import { createContext, useContext, ReactNode } from 'react';
import { useVenue } from './venue-context';

interface Brand {
  id: string;
  name: string;
  plan: string;
  created_at: string;
}

interface BrandMember {
  id: string;
  brand_id: string;
  user_id: string;
  role: 'staff' | 'manager';
}

interface BrandContextType {
  brands: Brand[];
  currentBrand: Brand | null;
  currentMember: BrandMember | null;
  setCurrentBrand: (brand: Brand | null) => void;
  loading: boolean;
  isAdmin: boolean;
  isDemoMode: boolean;
  refreshBrands: () => Promise<void>;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
  const {
    venues,
    currentVenue,
    currentMember,
    setCurrentVenue,
    loading,
    isAdmin,
    isDemoMode,
    refreshVenues,
  } = useVenue();

  // Map venue data to brand terminology
  const brands: Brand[] = venues.map(v => ({
    id: v.id,
    name: v.name,
    plan: v.plan,
    created_at: v.created_at,
  }));

  const currentBrand: Brand | null = currentVenue ? {
    id: currentVenue.id,
    name: currentVenue.name,
    plan: currentVenue.plan,
    created_at: currentVenue.created_at,
  } : null;

  const currentBrandMember: BrandMember | null = currentMember ? {
    id: currentMember.id,
    brand_id: currentMember.venue_id,
    user_id: currentMember.user_id,
    role: currentMember.role,
  } : null;

  const setCurrentBrand = (brand: Brand | null) => {
    if (brand) {
      const venue = venues.find(v => v.id === brand.id);
      setCurrentVenue(venue || null);
    } else {
      setCurrentVenue(null);
    }
  };

  const refreshBrands = async () => {
    await refreshVenues();
  };

  return (
    <BrandContext.Provider value={{
      brands,
      currentBrand,
      currentMember: currentBrandMember,
      setCurrentBrand,
      loading,
      isAdmin,
      isDemoMode,
      refreshBrands,
    }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (context === undefined) {
    throw new Error('useBrand must be used within a BrandProvider');
  }
  return context;
}
