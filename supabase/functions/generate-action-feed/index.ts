import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ActionItem {
  action_type: string;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  cta_label: string;
  cta_route: string;
  source_data?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { venue_id } = await req.json().catch(() => ({}));

    // If venue_id provided, process single venue; otherwise process all venues
    let venueIds: string[] = [];

    if (venue_id) {
      venueIds = [venue_id];
    } else {
      const { data: venues } = await supabaseAdmin
        .from("venues")
        .select("id");
      venueIds = (venues || []).map((v) => v.id);
    }

    let totalGenerated = 0;

    for (const venueId of venueIds) {
      const actions: ActionItem[] = [];
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 1. Check for pending review response tasks
      const { data: pendingReviews, count: reviewCount } = await supabaseAdmin
        .from("review_response_tasks")
        .select("id, ai_priority, author_name", { count: "exact" })
        .eq("venue_id", venueId)
        .eq("status", "pending")
        .limit(5);

      if (reviewCount && reviewCount > 0) {
        const hasP1 = (pendingReviews || []).some((r) => r.ai_priority === "P1");
        actions.push({
          action_type: "review_response",
          priority: hasP1 ? "high" : "medium",
          title: `${reviewCount} review${reviewCount > 1 ? "s" : ""} awaiting response`,
          description: hasP1
            ? "You have high-priority reviews that need attention."
            : "Draft responses are ready for your review.",
          cta_label: "View Reviews",
          cta_route: "/reputation/reviews",
          source_data: { count: reviewCount, has_p1: hasP1 },
        });
      }

      // 2. Check style engine setup status
      const { count: styleCount } = await supabaseAdmin
        .from("style_reference_assets")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("status", "analyzed");

      if ((styleCount || 0) < 3) {
        actions.push({
          action_type: "style_setup",
          priority: "low",
          title: "Complete your Style Engine setup",
          description: `Upload ${3 - (styleCount || 0)} more reference images to unlock AI-powered styling.`,
          cta_label: "Add References",
          cta_route: "/studio/style-engine",
          source_data: { current_count: styleCount || 0, target: 3 },
        });
      }

      // 3. Check for upcoming events without marketing
      const { data: upcomingEvents } = await supabaseAdmin
        .from("venue_event_plans")
        .select("id, title, starts_at, status")
        .eq("venue_id", venueId)
        .eq("status", "not_started")
        .gte("starts_at", now.toISOString())
        .lte("starts_at", sevenDaysFromNow.toISOString())
        .order("starts_at", { ascending: true })
        .limit(3);

      if (upcomingEvents && upcomingEvents.length > 0) {
        const event = upcomingEvents[0];
        actions.push({
          action_type: "event_planning",
          priority: "medium",
          title: `Plan marketing for "${event.title}"`,
          description: `Event is coming up soon. Create content and copy to promote it.`,
          cta_label: "Start Planning",
          cta_route: `/events/${event.id}`,
          source_data: { event_id: event.id, event_title: event.title },
        });
      }

      // 4. Check for content scheduling gaps
      const { count: scheduledCount } = await supabaseAdmin
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("status", "scheduled")
        .gte("scheduled_for", now.toISOString())
        .lte("scheduled_for", sevenDaysFromNow.toISOString());

      if ((scheduledCount || 0) === 0) {
        actions.push({
          action_type: "content_gap",
          priority: "low",
          title: "No content scheduled this week",
          description: "Keep your social presence active by scheduling some posts.",
          cta_label: "Create Content",
          cta_route: "/studio/editor",
          source_data: { days_ahead: 7 },
        });
      }

      // 5. Check for stale drafts
      const { data: staleDrafts, count: staleCount } = await supabaseAdmin
        .from("content_items")
        .select("id", { count: "exact" })
        .eq("venue_id", venueId)
        .eq("status", "draft")
        .lt("created_at", sevenDaysAgo.toISOString())
        .limit(5);

      if (staleCount && staleCount > 0) {
        actions.push({
          action_type: "stale_drafts",
          priority: "low",
          title: `${staleCount} draft${staleCount > 1 ? "s" : ""} waiting to be published`,
          description: "You have drafts that have been sitting for over a week.",
          cta_label: "Review Drafts",
          cta_route: "/content/drafts",
          source_data: { count: staleCount },
        });
      }

      // 6. Referral: pending bill verifications
      const { count: pendingVerifyCount } = await supabaseAdmin
        .from("referral_bookings")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("spend_verified", false)
        .in("booking_status", ["attended", "confirmed"]);

      if (pendingVerifyCount && pendingVerifyCount > 0) {
        actions.push({
          action_type: "referral_verify_bills",
          priority: "high",
          title: `Verify ${pendingVerifyCount} referral bill${pendingVerifyCount > 1 ? "s" : ""}`,
          description: "Partner referrals are awaiting spend verification.",
          cta_label: "Verify Now",
          cta_route: "/growth/referrals",
        });
      }

      // 7. Referral: pending payout approval
      const { count: pendingPayoutCount } = await supabaseAdmin
        .from("payout_batches")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("status", "pending_approval");

      if (pendingPayoutCount && pendingPayoutCount > 0) {
        actions.push({
          action_type: "referral_approve_payout",
          priority: "medium",
          title: "Approve payout batch",
          description: "A payout batch is ready for review and approval.",
          cta_label: "Review Payouts",
          cta_route: "/growth/payouts",
        });
      }

      // 8. Guest UGC submissions pending
      const { count: pendingUGCCount } = await supabaseAdmin
        .from("guest_submissions")
        .select("*", { count: "exact", head: true })
        .eq("venue_id", venueId)
        .eq("status", "pending");

      if (pendingUGCCount && pendingUGCCount > 0) {
        actions.push({
          action_type: "guest_ugc_review",
          priority: "low",
          title: `${pendingUGCCount} guest photo${pendingUGCCount > 1 ? "s" : ""} to review`,
          description: "Guest-submitted photos are waiting for your approval.",
          cta_label: "Review Photos",
          cta_route: "/venue/guest-photos",
        });
      }
      for (const action of actions) {
        // Use action_type + venue_id as idempotency key
        const { error } = await supabaseAdmin
          .from("action_feed_items")
          .upsert(
            {
              venue_id: venueId,
              action_type: action.action_type,
              priority: action.priority,
              title: action.title,
              description: action.description,
              cta_label: action.cta_label,
              cta_route: action.cta_route,
              source_data: action.source_data || {},
              status: "open",
            },
            { onConflict: "venue_id,action_type", ignoreDuplicates: false }
          );

        if (!error) {
          totalGenerated++;
        }
      }

      // Clean up resolved actions (e.g., if reviews are now 0, remove that action)
      if ((reviewCount || 0) === 0) {
        await supabaseAdmin
          .from("action_feed_items")
          .delete()
          .eq("venue_id", venueId)
          .eq("action_type", "review_response")
          .eq("status", "open");
      }

      if ((styleCount || 0) >= 3) {
        await supabaseAdmin
          .from("action_feed_items")
          .delete()
          .eq("venue_id", venueId)
          .eq("action_type", "style_setup")
          .eq("status", "open");
      }
    }

    console.log(`Action feed generated: ${totalGenerated} actions for ${venueIds.length} venues`);

    return new Response(
      JSON.stringify({ success: true, actions_generated: totalGenerated, venues_processed: venueIds.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-action-feed error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
