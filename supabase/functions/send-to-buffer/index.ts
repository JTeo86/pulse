import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getUserIdFromAuthHeader(supabase: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

function resolveMediaUrl(item: any): string | null {
  if (typeof item.media_master_url === 'string' && item.media_master_url.startsWith('http')) return item.media_master_url;
  const variants = item.media_variants;
  if (!variants || typeof variants !== 'object') return null;

  const queue: unknown[] = [variants];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (typeof current === 'string' && current.startsWith('http')) return current;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current === 'object') {
      queue.push(...Object.values(current as Record<string, unknown>));
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const userId = await getUserIdFromAuthHeader(supabase, req.headers.get('Authorization'));
    if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const venueId = String(body?.venue_id ?? '');
    const contentIds: string[] = Array.isArray(body?.content_ids) ? body.content_ids.map((id: unknown) => String(id)) : [];
    const profileIds: string[] = Array.isArray(body?.profile_ids) ? body.profile_ids.map((id: unknown) => String(id)) : [];

    if (!venueId || contentIds.length === 0 || profileIds.length === 0) {
      return jsonResponse({ error: 'venue_id, content_ids, and profile_ids are required' }, 400);
    }

    const { data: isMember } = await supabase.rpc('is_venue_member', { check_venue_id: venueId, check_user_id: userId });
    if (!isMember) return jsonResponse({ error: 'Forbidden' }, 403);

    const { data: connection } = await supabase
      .from('venue_buffer_connections')
      .select('buffer_access_token')
      .eq('venue_id', venueId)
      .maybeSingle();

    if (!connection?.buffer_access_token) {
      return jsonResponse({ error: 'Buffer is not connected for this venue.' }, 400);
    }

    const { data: items, error: itemsError } = await supabase
      .from('content_items')
      .select('id, venue_id, caption_final, status, media_master_url, media_variants')
      .eq('venue_id', venueId)
      .in('id', contentIds)
      .in('status', ['approved', 'ready', 'queued', 'failed']);

    if (itemsError) throw itemsError;

    const rows = items ?? [];
    if (rows.length !== contentIds.length) {
      return jsonResponse({ error: 'Some content items were not found or are not sendable.' }, 400);
    }

    const results: Array<{ content_id: string; ok: boolean; error?: string; update_id?: string }> = [];

    for (const item of rows) {
      const mediaUrl = resolveMediaUrl(item);
      const text = (item.caption_final || '').trim();

      if (!mediaUrl) {
        results.push({ content_id: item.id, ok: false, error: 'Missing media URL' });
        continue;
      }

      const payload = new URLSearchParams();
      profileIds.forEach((id, idx) => payload.append(`profile_ids[${idx}]`, id));
      payload.set('text', text);
      payload.set('media[photo]', mediaUrl);
      payload.set('shorten', 'false');
      payload.set('now', 'false');

      const sendRes = await fetch('https://api.bufferapp.com/1/updates/create.json', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.buffer_access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload,
      });

      const sendData = await sendRes.json();

      if (!sendRes.ok || !sendData?.success) {
        const message = sendData?.message || sendData?.error || 'Failed to send content to Buffer';
        results.push({ content_id: item.id, ok: false, error: String(message) });
        continue;
      }

      const updateId = sendData?.updates?.[0]?.id ? String(sendData.updates[0].id) : undefined;
      await supabase
        .from('content_items')
        .update({
          status: 'sent_to_buffer',
          buffer_update_id: updateId ?? null,
          buffer_payload: {
            profile_ids: profileIds,
            sent_at: new Date().toISOString(),
            update_count: Array.isArray(sendData?.updates) ? sendData.updates.length : null,
          },
        })
        .eq('id', item.id)
        .eq('venue_id', venueId);

      results.push({ content_id: item.id, ok: true, update_id: updateId });
    }

    const successCount = results.filter((r) => r.ok).length;
    return jsonResponse({
      success: successCount > 0,
      sent: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (error) {
    console.error('send-to-buffer error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
});
