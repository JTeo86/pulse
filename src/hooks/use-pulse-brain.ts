/**
 * Pulse Brain — Shared intelligence layer
 * Aggregates venue, brand, style, performance, and campaign data
 * into a single context object for AI-powered generation across all modules.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVenue } from '@/lib/venue-context';

export interface PulseBrainContext {
  // Venue identity
  venue: {
    id: string;
    name: string;
    country_code: string;
    city: string | null;
    timezone: string;
    website_url: string | null;
    instagram_handle: string | null;
  } | null;

  // Brand basics
  brand: {
    preset: string | null;
    rules_text: string | null;
    example_urls: string[];
  } | null;

  // Visual style summary
  styleAssetCount: number;

  // Past campaign performance
  recentPlans: {
    id: string;
    title: string;
    status: string;
    starts_at: string;
  }[];

  // Content library stats
  contentStats: {
    totalAssets: number;
    favoriteAssets: number;
  };

  // Revenue signals summary
  revenueInsights: {
    totalSignals: number;
    estimatedRevenue: number;
  };

  loading: boolean;
}

export function usePulseBrain(): PulseBrainContext {
  const { currentVenue } = useVenue();
  const [brand, setBrand] = useState<PulseBrainContext['brand']>(null);
  const [styleAssetCount, setStyleAssetCount] = useState(0);
  const [recentPlans, setRecentPlans] = useState<PulseBrainContext['recentPlans']>([]);
  const [contentStats, setContentStats] = useState<PulseBrainContext['contentStats']>({ totalAssets: 0, favoriteAssets: 0 });
  const [revenueInsights, setRevenueInsights] = useState<PulseBrainContext['revenueInsights']>({ totalSignals: 0, estimatedRevenue: 0 });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!currentVenue) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [brandRes, styleRes, plansRes, assetsRes, revenueRes] = await Promise.all([
        supabase.from('brand_kits').select('preset, rules_text, example_urls').eq('venue_id', currentVenue.id).maybeSingle(),
        supabase.from('venue_style_reference_assets').select('id', { count: 'exact', head: true }).eq('venue_id', currentVenue.id),
        supabase.from('venue_event_plans').select('id, title, status, starts_at').eq('venue_id', currentVenue.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('content_assets').select('id, is_favorite', { count: 'exact' }).eq('venue_id', currentVenue.id).limit(1),
        supabase.from('revenue_signals').select('id, revenue_estimate').eq('venue_id', currentVenue.id).limit(50),
      ]);

      if (brandRes.data) {
        setBrand({
          preset: brandRes.data.preset,
          rules_text: brandRes.data.rules_text,
          example_urls: Array.isArray(brandRes.data.example_urls) ? brandRes.data.example_urls as string[] : [],
        });
      }

      setStyleAssetCount(styleRes.count || 0);
      setRecentPlans((plansRes.data as any[]) || []);

      const totalAssets = assetsRes.count || 0;
      setContentStats({ totalAssets, favoriteAssets: 0 });

      const signals = (revenueRes.data as any[]) || [];
      setRevenueInsights({
        totalSignals: signals.length,
        estimatedRevenue: signals.reduce((sum, s) => sum + (Number(s.revenue_estimate) || 0), 0),
      });
    } catch (err) {
      console.error('Pulse Brain fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentVenue?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const venue = currentVenue ? {
    id: currentVenue.id,
    name: currentVenue.name,
    country_code: (currentVenue as any).country_code || 'GB',
    city: (currentVenue as any).city || null,
    timezone: (currentVenue as any).timezone || 'Europe/London',
    website_url: (currentVenue as any).website_url || null,
    instagram_handle: (currentVenue as any).instagram_handle || null,
  } : null;

  return {
    venue,
    brand,
    styleAssetCount,
    recentPlans,
    contentStats,
    revenueInsights,
    loading,
  };
}

/**
 * Build a strategy context string for AI prompts.
 * Used by edge functions and campaign pack generation.
 */
export function buildStrategyContext(brain: PulseBrainContext, plan?: any): string {
  const parts: string[] = [];

  if (brain.venue) {
    parts.push(`Venue: ${brain.venue.name} (${brain.venue.city || brain.venue.country_code})`);
    if (brain.venue.instagram_handle) parts.push(`Instagram: @${brain.venue.instagram_handle}`);
  }

  if (brain.brand) {
    if (brain.brand.preset) parts.push(`Brand tone: ${brain.brand.preset}`);
    if (brain.brand.rules_text) parts.push(`Brand rules: ${brain.brand.rules_text}`);
  }

  if (plan) {
    parts.push(`Plan: ${plan.title}`);
    if (plan.decision?.offer_terms) parts.push(`Offer: ${plan.decision.offer_terms}`);
    if (plan.decision?.run_offer) parts.push('Running a promotional offer');
  }

  if (brain.revenueInsights.totalSignals > 0) {
    parts.push(`Revenue signals: ${brain.revenueInsights.totalSignals} tracked, £${brain.revenueInsights.estimatedRevenue.toFixed(0)} estimated`);
  }

  return parts.join('\n');
}
