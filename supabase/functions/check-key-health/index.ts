import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is platform admin
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminCheck } = await supabase.rpc('is_platform_admin', { check_user_id: user.id });
    if (!adminCheck) {
      return new Response(JSON.stringify({ error: 'Forbidden: platform admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { key_name, test_gemini_replate, gemini_model } = body as {
      key_name: string;
      test_gemini_replate?: boolean;
      gemini_model?: string;
    };
    if (!key_name) {
      return new Response(JSON.stringify({ error: 'key_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the key
    const { data: keyRow, error: keyError } = await supabase
      .from('platform_api_keys')
      .select('key_name, key_value, category')
      .eq('key_name', key_name)
      .single();

    if (keyError || !keyRow) {
      return new Response(JSON.stringify({ error: 'Key not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const value = keyRow.key_value?.trim() ?? '';

    // Missing
    if (!value) {
      await supabase.from('platform_api_keys').update({
        health_status: 'missing',
        last_checked_at: new Date().toISOString(),
        last_error: 'No value configured',
      }).eq('key_name', key_name);
      return new Response(JSON.stringify({ status: 'missing', message: 'No value configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Run validation by key name
    let status: 'healthy' | 'invalid' | 'missing' = 'healthy';
    let message = 'Validation passed';

    try {
      if (key_name === 'SERPAPI_API_KEY') {
        const r = await fetch(
          `https://serpapi.com/account.json?api_key=${encodeURIComponent(value)}`
        );
        if (r.status === 401 || r.status === 403) {
          status = 'invalid'; message = `${r.status} Unauthorized — check SerpAPI key`;
        } else if (!r.ok) {
          status = 'invalid'; message = `HTTP ${r.status}`;
        } else {
          const j = await r.json().catch(() => ({}));
          message = `Account OK — plan: ${j.plan_id || j.plan || 'unknown'}, searches left: ${j.total_searches_left ?? 'unknown'}`;
        }
      } else if (key_name === 'APIFY_API_TOKEN') {
        const r = await fetch(`https://api.apify.com/v2/users/me?token=${value}`);
        if (r.status === 401) { status = 'invalid'; message = '401 Unauthorized — check Apify token'; }
        else if (!r.ok) { status = 'invalid'; message = `HTTP ${r.status}`; }
        await r.text();
      } else if (key_name === 'PHOTOROOM_API_KEY') {
        // PhotoRoom: validate key format (starts with sk_live_ or sk_test_) + ping
        if (!value.startsWith('sk_live_') && !value.startsWith('sk_test_') && value.length < 20) {
          status = 'invalid'; message = 'Key format invalid — expected sk_live_... or sk_test_...';
        } else {
          // Minimal request to validate auth (will 400 on bad form data but 401 if key is wrong)
          const fd = new FormData();
          fd.append('image_file_b64', 'invalid'); // intentionally bad — we just want auth check
          const r = await fetch('https://sdk.photoroom.com/v1/segment', {
            method: 'POST', headers: { 'x-api-key': value }, body: fd,
          });
          if (r.status === 401 || r.status === 403) {
            status = 'invalid'; message = `${r.status} Unauthorized — check PhotoRoom key`;
          }
          await r.text();
        }
      } else if (key_name === 'GEMINI_IMAGE_API_KEY') {
        if (test_gemini_replate) {
          // Full replate endpoint test via Lovable AI Gateway using the configured model
          const model = gemini_model || 'google/gemini-2.5-flash';
          const lovableKey = Deno.env.get('LOVABLE_API_KEY');
          const testKey = value || lovableKey;
          if (!testKey) {
            status = 'invalid';
            message = 'No Gemini or gateway key available for test';
          } else {
            const testResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${testKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the word OK.' }] }],
                max_tokens: 5,
              }),
            });
            const testStatus = testResp.status;
            if (testStatus === 404) {
              status = 'invalid';
              message = `Gemini 404: model/endpoint not found. Check model name "${model}" in Platform Admin → Integrations.`;
            } else if (!testResp.ok) {
              const errBody = await testResp.text().catch(() => '');
              status = 'invalid';
              message = `Gemini ${testStatus}: ${errBody.substring(0, 300)}`;
            } else {
              message = `Gemini replate test passed (model=${model}, status=${testStatus})`;
            }
            // Update result to include model info
            await supabase.from('platform_api_keys').update({
              health_status: status,
              last_checked_at: new Date().toISOString(),
              last_error: status !== 'healthy' ? message : null,
              is_configured: true,
            }).eq('key_name', key_name);

            return new Response(JSON.stringify({ status, message, model, gemini_status: testStatus }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          // Standard key validation: list models
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1/models?key=${value}`
          );
          if (r.status === 400 || r.status === 401 || r.status === 403) {
            const j = await r.json().catch(() => ({}));
            status = 'invalid';
            message = j?.error?.message ?? `HTTP ${r.status} — check Gemini API key`;
          } else {
            await r.text();
          }
        }
      } else if (key_name === 'KLING_API_KEY') {
        // Kling: validate key length as minimal check (no public ping endpoint)
        if (value.length < 20) {
          status = 'invalid'; message = 'Key appears too short — check Kling API key';
        } else {
          message = 'Format check passed (live ping not available)';
        }
      } else if (key_name === 'BUFFER_API_KEY') {
        const r = await fetch('https://api.bufferapp.com/1/user.json', {
          headers: { Authorization: `Bearer ${value}` },
        });
        if (r.status === 401 || r.status === 403) {
          status = 'invalid'; message = `${r.status} Unauthorized — check Buffer API key`;
        } else if (!r.ok) {
          status = 'invalid'; message = `HTTP ${r.status}`;
        }
        await r.text();
      } else if (key_name === 'MAKE_WEBHOOK_URL') {
        // Validate URL format
        try {
          const url = new URL(value);
          if (!url.hostname.includes('make.com') && !url.hostname.includes('hook.eu') && !url.hostname.includes('hook.us')) {
            message = 'URL format valid (domain not recognised as Make.com — verify manually)';
          }
        } catch {
          status = 'invalid'; message = 'Invalid URL format';
        }
      } else {
        // Unknown key — just mark healthy if it has a value
        message = 'Value present (no specific test available)';
      }
    } catch (err) {
      status = 'invalid';
      message = err instanceof Error ? err.message : 'Connection error during health check';
    }

    await supabase.from('platform_api_keys').update({
      health_status: status,
      last_checked_at: new Date().toISOString(),
      last_error: status !== 'healthy' ? message : null,
      is_configured: true,
    }).eq('key_name', key_name);

    return new Response(JSON.stringify({ status, message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('check-key-health error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
