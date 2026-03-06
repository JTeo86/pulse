import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Fetch an API key from platform_api_keys table, falling back to Deno.env */
async function getPlatformKey(
  supabase: any,
  keyName: string,
): Promise<{ value: string | null; source: 'db' | 'env' | 'none' }> {
  try {
    const { data, error } = await supabase
      .from('platform_api_keys')
      .select('key_value, is_configured')
      .eq('key_name', keyName)
      .single();
    if (!error && data?.is_configured && data.key_value?.trim()) {
      return { value: data.key_value.trim(), source: 'db' };
    }
  } catch { /* fall through to env */ }
  const envVal = Deno.env.get(keyName);
  if (envVal?.trim()) {
    return { value: envVal.trim(), source: 'env' };
  }
  return { value: null, source: 'none' };
}

/** Resolve Gemini key with priority: GEMINI_IMAGE_API_KEY > GEMINI_API_KEY > GOOGLE_API_KEY */
async function resolveGeminiKey(
  supabase: any,
): Promise<{ value: string | null; source: string }> {
  for (const keyName of ['GEMINI_IMAGE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    const result = await getPlatformKey(supabase, keyName);
    if (result.value) {
      return { value: result.value, source: `${keyName}(${result.source})` };
    }
  }
  return { value: null, source: 'none' };
}

async function resolveSourceImage(
  supabase: any,
  venueId: string,
  inputImageUrl?: string,
  sourceFileBase64?: string,
  sourceFileName?: string,
): Promise<{ blob: Blob; publicUrl: string }> {
  if (sourceFileBase64) {
    const bin = atob(sourceFileBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = (sourceFileName || 'image.jpg').split('.').pop() || 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const blob = new Blob([bytes], { type: mime });
    const path = `venues/${venueId}/uploads/${crypto.randomUUID()}.${ext}`;
    await supabase.storage.from('venue-assets').upload(path, bytes, { contentType: mime });
    const publicUrl = supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
    return { blob, publicUrl };
  }
  if (inputImageUrl) {
    const resp = await fetch(inputImageUrl);
    if (!resp.ok) throw new Error('Failed to fetch source image');
    return { blob: await resp.blob(), publicUrl: inputImageUrl };
  }
  throw new Error('input_image_url or sourceFileBase64 required');
}

/** Detect image format from magic bytes and return extension + contentType */
function sniffImage(buf: ArrayBuffer | Uint8Array): { ext: string; contentType: string } {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (b.length >= 4 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    // RIFF header — likely WebP (bytes 8-11 = WEBP)
    if (b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      return { ext: 'webp', contentType: 'image/webp' };
    }
  }
  // Default: JPEG (FFD8)
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

async function uploadResultBuffer(
  supabase: any,
  venueId: string,
  buffer: ArrayBuffer | Uint8Array,
  suffix: string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const { ext, contentType } = sniffImage(buffer);
  const path = `venues/${venueId}/edited/${crypto.randomUUID()}_${suffix}.${ext}`;
  await supabase.storage.from('venue-assets').upload(path, buffer, { contentType });
  const publicUrl = supabase.storage.from('venue-assets').getPublicUrl(path).data.publicUrl;
  return { publicUrl, storagePath: path };
}

/** Fetch an atmosphere reference image as a downloadable Blob.
 *  Tries venue_atmosphere (public) then venue-assets (public).
 *  Returns the raw bytes so we can send them directly to PhotoRoom. */
async function fetchAtmosphereBackground(
  supabase: any,
  venueId: string,
): Promise<{
  blob: Blob;
  assetId: string;
  storagePath: string;
  publicUrl: string;
  headStatus: number;
  bucket: string;
} | null> {
  const { data: assets, error } = await supabase
    .from('style_reference_assets')
    .select('id, storage_path, pinned')
    .eq('venue_id', venueId)
    .eq('channel', 'atmosphere')
    .eq('status', 'analyzed')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[PRO-PHOTO] Error querying atmosphere assets:', error.message);
    return null;
  }
  if (!assets || assets.length === 0) {
    console.log('[PRO-PHOTO] No analyzed atmosphere assets found for this venue');
    return null;
  }

  console.log(`[PRO-PHOTO] Found ${assets.length} analyzed atmosphere asset(s)`);

  // Shuffle top 3 to avoid repetitive visuals
  const pool = assets.slice(0, Math.min(3, assets.length));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const buckets = ['venue_atmosphere', 'venue-assets'];

  for (const asset of pool) {
    for (const bucketName of buckets) {
      const publicUrl = supabase.storage.from(bucketName).getPublicUrl(asset.storage_path).data.publicUrl;
      try {
        console.log(`[PRO-PHOTO] HEAD ${bucketName}/${asset.storage_path} → ${publicUrl}`);
        const headResp = await fetch(publicUrl, { method: 'HEAD' });
        console.log(`[PRO-PHOTO] HEAD status=${headResp.status}`);

        if (headResp.ok) {
          // Download the actual image bytes
          console.log(`[PRO-PHOTO] Downloading background image…`);
          const dlResp = await fetch(publicUrl);
          if (dlResp.ok) {
            const blob = await dlResp.blob();
            console.log(`[PRO-PHOTO] Background downloaded: ${blob.size} bytes, type=${blob.type}`);
            return {
              blob,
              assetId: asset.id,
              storagePath: asset.storage_path,
              publicUrl,
              headStatus: headResp.status,
              bucket: bucketName,
            };
          }
          console.warn(`[PRO-PHOTO] Download failed after HEAD OK: ${dlResp.status}`);
        }
      } catch (e) {
        console.warn(`[PRO-PHOTO] Fetch error for ${bucketName}/${asset.storage_path}:`, e);
      }
    }
    console.warn(`[PRO-PHOTO] Asset ${asset.id} not accessible in any bucket, trying next…`);
  }

  return null;
}

/** Generate an AI background image via Gemini and return as Blob */
async function generateAIBackgroundImage(
  lovableApiKey: string,
  brandPreset: string,
  brandRules: string,
  venueName: string,
  venueCity: string,
): Promise<Blob | null> {
  const toneMap: Record<string, string> = {
    casual: 'bright, relaxed, modern casual dining restaurant with natural wood tables and warm ambient light',
    midrange: 'elegant mid-range restaurant with linen tablecloths, warm overhead lighting, and tasteful decor',
    premium: 'upscale fine dining restaurant with dark wood, candlelight, and luxury tableware',
    luxury: 'exclusive luxury restaurant with marble surfaces, crystal glassware, and dramatic low lighting',
    nightlife: 'trendy bar-restaurant with moody neon-accented lighting and dark contemporary interiors',
    family: 'bright family-friendly restaurant with clean tables and cheerful warm lighting',
  };
  const tone = toneMap[brandPreset] || toneMap.casual;
  const prompt = `Generate a photorealistic restaurant table background image for food photography compositing. Style: ${tone}. ${venueCity ? `Located in ${venueCity}.` : ''} The image shows an empty table surface with the restaurant environment behind it. No food items, no people, no plates — just the empty tabletop and venue ambiance. Shot on a DSLR camera with shallow depth of field, natural lighting, soft bokeh. Photorealistic, no illustration, no text, no watermarks. ${brandRules ? `Brand notes: ${brandRules.substring(0, 200)}` : ''} Output as JPEG.`.trim();

  try {
    console.log('[PRO-PHOTO] Generating AI background via Gemini…');
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        modalities: ['image', 'text'],
      }),
    });

    if (!resp.ok) {
      console.warn(`[PRO-PHOTO] Gemini background gen failed: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl || !imageUrl.startsWith('data:image')) {
      console.warn('[PRO-PHOTO] Gemini returned no background image data');
      return null;
    }

    const base64Data = imageUrl.split(',')[1];
    const bin = atob(base64Data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const isPng = imageUrl.startsWith('data:image/png');
    const blob = new Blob([bytes], { type: isPng ? 'image/png' : 'image/jpeg' });
    console.log(`[PRO-PHOTO] AI background generated: ${blob.size} bytes, format=${isPng ? 'PNG' : 'JPEG'}`);
    return blob;
  } catch (e) {
    console.warn('[PRO-PHOTO] Gemini background generation error:', e);
    return null;
  }
}

function buildBackgroundPrompt(brandPreset: string, venueCity: string, brandRules: string): string {
  const toneMap: Record<string, string> = {
    casual: 'bright, relaxed, modern casual dining restaurant with natural wood tables and warm ambient light',
    midrange: 'elegant mid-range restaurant with linen tablecloths, warm overhead lighting, and tasteful decor',
    premium: 'upscale fine dining restaurant with dark wood, candlelight, and luxury tableware',
    luxury: 'exclusive luxury restaurant with marble surfaces, crystal glassware, and dramatic low lighting',
    nightlife: 'trendy bar-restaurant with moody neon-accented lighting and dark contemporary interiors',
    family: 'bright family-friendly restaurant with clean tables and cheerful warm lighting',
  };
  const tone = toneMap[brandPreset] || toneMap.casual;
  return `Realistic photo of a ${tone}. ${venueCity ? `Located in ${venueCity}.` : ''} Shot on a DSLR camera with shallow depth of field, natural lighting, soft bokeh. The table is set for food photography. Photorealistic, no fantasy, no illustration, no text, no watermarks. ${brandRules ? `Brand notes: ${brandRules.substring(0, 200)}` : ''}`.trim();
}

/** Call PhotoRoom v2/edit with one automatic retry on 5xx */
async function callPhotoRoomWithRetry(
  form: FormData,
  params: URLSearchParams,
  apiKey: string,
): Promise<{ ok: boolean; status: number; buffer?: ArrayBuffer; errorBody?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch(
      `https://image-api.photoroom.com/v2/edit?${params.toString()}`,
      { method: 'POST', headers: { 'x-api-key': apiKey }, body: form },
    );
    if (resp.ok) {
      return { ok: true, status: resp.status, buffer: await resp.arrayBuffer() };
    }
    const errText = await resp.text();
    if (resp.status >= 500 && attempt === 0) {
      console.warn(`[PRO-PHOTO] PhotoRoom 5xx (${resp.status}), retrying once…`);
      continue;
    }
    return { ok: false, status: resp.status, errorBody: errText };
  }
  return { ok: false, status: 0, errorBody: 'Exhausted retries' };
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResp({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonResp({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { venue_id, input_image_url, sourceFileBase64, sourceFileName, style_preset, realism_mode, job_id } = body;
    if (!venue_id) return jsonResp({ error: 'venue_id required' }, 400);

    const { data: membership } = await supabase
      .from('venue_members').select('id').eq('venue_id', venue_id).eq('user_id', user.id).single();
    if (!membership) return jsonResp({ error: 'Access denied' }, 403);

    // ═══ Resolve API keys from platform_api_keys DB (fallback: env) ═══
    const photoRoomResult = await getPlatformKey(supabase, 'PHOTOROOM_API_KEY');
    const photoRoomApiKey = photoRoomResult.value;
    if (!photoRoomApiKey) {
      console.error('[PRO-PHOTO] Missing API key: PHOTOROOM_API_KEY (checked DB + env)');
      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error',
          error_message: 'Missing API key: PHOTOROOM_API_KEY. Configure in Platform Admin → Integrations.',
        }).eq('id', job_id);
      }
      return jsonResp({ error: 'Missing API key: PHOTOROOM_API_KEY. Configure in Platform Admin → Integrations.' }, 500);
    }
    console.log(`[PRO-PHOTO] PhotoRoom key source: ${photoRoomResult.source}`);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    // ═══ STEP 0 — Resolve source image ═══
    console.log('[PRO-PHOTO] Step 0: Resolving source image…');
    const { blob: sourceBlob, publicUrl: resolvedSourceUrl } = await resolveSourceImage(
      supabase, venue_id, input_image_url, sourceFileBase64, sourceFileName,
    );

    // ═══ STEP 1 — Gather style context ═══
    console.log('[PRO-PHOTO] Step 1: Gathering style context…');

    const { data: brandKit } = await supabase
      .from('brand_kits')
      .select('preset, rules_text')
      .eq('venue_id', venue_id)
      .single();

    const { data: venue } = await supabase
      .from('venues')
      .select('name, city')
      .eq('id', venue_id)
      .single();

    const brandPreset = brandKit?.preset || style_preset || 'casual';
    const brandRules = brandKit?.rules_text || '';
    const venueName = venue?.name || 'restaurant';
    const venueCity = venue?.city || '';

    // ═══ STEP 2 — Fetch background as actual image BYTES ═══
    console.log('[PRO-PHOTO] Step 2: Resolving background image…');

    let backgroundBlob: Blob | null = null;
    type BackgroundMode = 'atmosphere_ref' | 'brand_generated' | 'studio_default';
    let backgroundMode: BackgroundMode = 'brand_generated';
    let bgMeta = {
      bucket: '',
      path: '',
      public_url: '',
      public_url_head_status: 0,
      asset_id: '',
      background_blob_size: 0,
      background_blob_type: '',
    };

    // Priority 1: Style Intelligence atmosphere references
    const atmosphereResult = await fetchAtmosphereBackground(supabase, venue_id);
    if (atmosphereResult) {
      backgroundBlob = atmosphereResult.blob;
      backgroundMode = 'atmosphere_ref';
      bgMeta = {
        bucket: atmosphereResult.bucket,
        path: atmosphereResult.storagePath,
        public_url: atmosphereResult.publicUrl,
        public_url_head_status: atmosphereResult.headStatus,
        asset_id: atmosphereResult.assetId,
        background_blob_size: atmosphereResult.blob.size,
        background_blob_type: atmosphereResult.blob.type,
      };
      console.log(`[PRO-PHOTO] Step 2: Background = atmosphere_ref (asset=${atmosphereResult.assetId}, ${atmosphereResult.blob.size} bytes)`);
    }

    // Priority 2: Generate AI background image via Gemini (actual image, not just a prompt)
    if (!backgroundBlob && lovableApiKey) {
      console.log('[PRO-PHOTO] Step 2: No atmosphere ref — generating AI background image…');
      backgroundBlob = await generateAIBackgroundImage(lovableApiKey, brandPreset, brandRules, venueName, venueCity);
      if (backgroundBlob) {
        backgroundMode = 'brand_generated';
        // Save AI background for debugging/audit
        const bgUpload = await uploadResultBuffer(supabase, venue_id, await backgroundBlob.arrayBuffer(), 'ai_background');
        bgMeta.public_url = bgUpload.publicUrl;
        bgMeta.path = bgUpload.storagePath;
        bgMeta.background_blob_size = backgroundBlob.size;
        bgMeta.background_blob_type = backgroundBlob.type;
        console.log(`[PRO-PHOTO] Step 2: AI background generated and saved: ${bgUpload.publicUrl}`);
      }
    }

    // ═══ STEP 3 — Build PhotoRoom compose request ═══
    console.log('[PRO-PHOTO] Step 3: Building compose request…');

    const params = new URLSearchParams();
    params.set('lighting.mode', 'ai.auto');
    params.set('shadow.mode', 'ai.soft');
    params.set('outputFormat', 'jpg');

    const composeForm = new FormData();
    composeForm.append('imageFile', sourceBlob, 'image.jpg');

    if (backgroundBlob) {
      // KEY FIX: Send background as a FILE in the multipart form data.
      // This bypasses URL reachability issues AND WebP format issues.
      // PhotoRoom receives the raw bytes directly.
      composeForm.append('background.imageFile', backgroundBlob, 'background.jpg');
      console.log(`[PRO-PHOTO] Step 3: Background attached as FILE (${backgroundBlob.size} bytes, type=${backgroundBlob.type})`);
    } else {
      // Last resort: use PhotoRoom's prompt-based background generation
      const bgPrompt = buildBackgroundPrompt(brandPreset, venueCity, brandRules);
      params.set('background.prompt', bgPrompt);
      backgroundMode = 'brand_generated';
      console.log('[PRO-PHOTO] Step 3: Using background.prompt (no background image available)');
    }

    // ═══ STEP 4 — PhotoRoom compose (with retry) ═══
    console.log('[PRO-PHOTO] Step 4: Calling PhotoRoom v2/edit (compose)…');

    const composeResult = await callPhotoRoomWithRetry(composeForm, params, photoRoomApiKey);

    if (!composeResult.ok || !composeResult.buffer) {
      console.error(`[PRO-PHOTO] PhotoRoom compose FAILED: status=${composeResult.status}, body=${composeResult.errorBody}`);

      if (job_id) {
        await supabase.from('editor_jobs').update({
          status: 'error',
          error_message: `Background composition failed (PhotoRoom ${composeResult.status}). Check Style Intelligence backgrounds or try again.`,
        }).eq('id', job_id);
      }

      return jsonResp({
        error: 'Background could not be applied. Check Style Intelligence backgrounds or try again.',
        photoroom_status: composeResult.status,
        composition_success: false,
      }, 502);
    }

    const compositionSuccess = true;
    const { publicUrl: composedUrl, storagePath: composedStoragePath } = await uploadResultBuffer(
      supabase, venue_id, composeResult.buffer, 'composed',
    );
    console.log(`[PRO-PHOTO] Step 4 DONE — composed_url: ${composedUrl}, photoroom_status=${composeResult.status}, size=${composeResult.buffer.byteLength} bytes`);

    // ═══ STEP 5 — Gemini retouch (Pro Replate) ═══
    // Try multiple key names in priority order (direct Gemini AI Studio keys)
    // Resolve Gemini key from platform_api_keys DB first, then env
    const geminiResult = await resolveGeminiKey(supabase);
    let replateApiKey: string | undefined = geminiResult.value ?? undefined;
    let replateKeySource = geminiResult.source;
    // Fall back to Lovable gateway
    const useGateway = !replateApiKey;
    if (!replateApiKey && lovableApiKey) {
      replateApiKey = lovableApiKey;
      replateKeySource = 'LOVABLE_API_KEY(env)';
    }
    console.log(`[PRO-PHOTO] Gemini key source: ${replateKeySource}`);

    // Fetch model name from platform_settings
    let geminiReplateModel = 'gemini-2.5-flash-image';
    try {
      const { data: modelSetting } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'gemini_replate_model')
        .single();
      if (modelSetting?.value) {
        // Strip google/ prefix if present — direct API uses bare model names
        geminiReplateModel = modelSetting.value.replace(/^google\//, '');
      }
    } catch { /* use default */ }

    // Check if model is image-capable (must contain '-image' in name)
    const isImageCapable = geminiReplateModel.includes('-image') || geminiReplateModel.includes('image-generation');

    let finalUrl = composedUrl;
    let finalStoragePath = composedStoragePath;
    let geminiUsed = false;
    let geminiOutputContentType = 'skipped';
    let replateSkipReason: string | null = null;

    // For gateway calls, re-add google/ prefix
    const gatewayModel = geminiReplateModel.startsWith('google/') ? geminiReplateModel : `google/${geminiReplateModel}`;

    console.log(JSON.stringify({
      tag: 'PRO-REPLATE-CONFIG',
      photoroom_key_source: photoRoomResult.source,
      gemini_key_source: replateKeySource,
      model: geminiReplateModel,
      use_gateway: useGateway,
      is_image_capable: isImageCapable,
      has_key: !!replateApiKey,
    }));

    if (!replateApiKey) {
      replateSkipReason = 'Missing Gemini API key. Configure GEMINI_IMAGE_API_KEY in Platform Admin → Integrations.';
      console.error(`[PRO-PHOTO] Step 5: Skipped — ${replateSkipReason}`);
    } else if (!compositionSuccess) {
      replateSkipReason = 'Composition step failed — replate skipped.';
      console.log(`[PRO-PHOTO] Step 5: Skipped — ${replateSkipReason}`);
    } else if (!isImageCapable) {
      replateSkipReason = `Selected Gemini model is text-only (${geminiReplateModel}); choose an image model (e.g. gemini-2.5-flash-image). Update in Platform Admin → Integrations.`;
      console.warn(`[PRO-PHOTO] Step 5: Skipped — ${replateSkipReason}`);
    } else {
      try {
        console.log(`[PRO-PHOTO] Step 5: Gemini retouch (key=${replateKeySource}, model=${geminiReplateModel}, gateway=${useGateway})…`);

        const modeMap: Record<string, string> = {
          safe: 'Minimal lighting correction. Preserve original tone and exposure as closely as possible.',
          enhanced: 'Professional lighting refinement. Strengthen micro-contrast subtly. Add subtle depth-of-field enhancement.',
          editorial: 'Slightly stronger mood lighting with enhanced highlight control. Cinematic tone grading. Still absolutely no structural changes.',
        };
        const modeInstruction = modeMap[realism_mode] || modeMap.safe;

        const prompt = `You are a professional food photography retouch specialist.

Your task is to improve lighting, clarity, and realism while preserving the exact physical structure of the dish AND the background environment.

This is a retouch task, NOT a redesign task. The background is a real venue environment — preserve it exactly.

Hard constraints (non-negotiable):
- Do NOT add garnish.
- Do NOT remove garnish.
- Do NOT add ingredients.
- Do NOT remove ingredients.
- Do NOT change portion size.
- Do NOT change plate shape.
- Do NOT change tableware.
- Do NOT introduce new props.
- Do NOT alter cuisine identity.
- Do NOT reposition food items.
- Do NOT add sauces or decorative elements.
- Do NOT add text, watermarks, logos, or any overlays.
- Do NOT make the image look artificial, illustrated, or AI-generated.
- Do NOT alter, darken, remove, or replace the background.
- Do NOT make the background black or transparent.
- The background must remain EXACTLY as it appears in the input.

You must preserve:
- Ingredient count
- Ingredient placement
- Plate geometry
- Food structure
- Garnish quantity and position
- Background environment (tables, lighting, venue decor)

Allowed improvements (apply to the whole image naturally):
- Adjust lighting to look like professional DSLR food photography.
- Improve white balance.
- Improve natural shadows and highlights.
- Enhance crispness and texture detail of the food.
- Clean minor plating imperfections without adding new elements.
- Subtle color grading consistent with a real restaurant shoot.
- Realistic depth-of-field enhancement.

Mode: ${modeInstruction}
Brand preset: ${brandPreset}
${brandRules ? `Brand notes: ${brandRules.substring(0, 200)}` : ''}

Output the FULL image including the background, not just the dish.
Output as JPEG — do NOT output PNG with transparency.

If unsure whether a change alters the dish identity or background, do NOT make the change.

Maximum realism. Zero hallucination. Zero new elements.`;

        let geminiStatus: number;
        let geminiImageBase64: string | null = null;
        let geminiImageMime = 'image/jpeg';

        if (useGateway) {
          // ── Lovable AI Gateway (OpenAI-compatible format) ──
          const geminiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${replateApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: gatewayModel,
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: composedUrl } },
                ],
              }],
              modalities: ['image', 'text'],
            }),
          });
          geminiStatus = geminiResp.status;
          console.log(`[PRO-PHOTO] Step 5: Gateway response status=${geminiStatus}`);

          if (geminiResp.ok) {
            const geminiData = await geminiResp.json();
            const generatedImage = geminiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (generatedImage && generatedImage.startsWith('data:image')) {
              geminiImageBase64 = generatedImage.split(',')[1];
              geminiImageMime = generatedImage.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
            }
          } else {
            const errBody = await geminiResp.text().catch(() => '');
            if (geminiStatus === 404) {
              replateSkipReason = `Gemini 404: model/endpoint not found. Check model name "${gatewayModel}" in Platform Admin → Integrations.`;
            } else {
              replateSkipReason = `Gemini API returned ${geminiStatus}: ${errBody.substring(0, 500)}`;
            }
            console.warn(`[PRO-PHOTO] ${replateSkipReason}`);
          }
        } else {
          // ── Direct Gemini Developer API (AI Studio) ──
          // Download composed image to send as inline_data
          let composedBase64 = '';
          let composedMime = 'image/jpeg';
          try {
            const dlResp = await fetch(composedUrl);
            if (dlResp.ok) {
              const arrBuf = await dlResp.arrayBuffer();
              const bytes = new Uint8Array(arrBuf);
              // Convert to base64
              let binary = '';
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              composedBase64 = btoa(binary);
              composedMime = dlResp.headers.get('content-type') || 'image/jpeg';
            } else {
              throw new Error(`Failed to download composed image: ${dlResp.status}`);
            }
          } catch (dlErr) {
            replateSkipReason = `Failed to download composed image for Gemini: ${dlErr instanceof Error ? dlErr.message : 'unknown'}`;
            console.warn(`[PRO-PHOTO] ${replateSkipReason}`);
          }

          if (!replateSkipReason && composedBase64) {
            const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiReplateModel}:generateContent?key=${replateApiKey}`;
            console.log(`[PRO-PHOTO] Step 5: Direct Gemini API → models/${geminiReplateModel}:generateContent`);

            const geminiResp = await fetch(geminiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: prompt },
                    { inline_data: { mime_type: composedMime, data: composedBase64 } },
                  ],
                }],
                generationConfig: {
                  responseModalities: ['TEXT', 'IMAGE'],
                },
              }),
            });

            geminiStatus = geminiResp.status;
            console.log(`[PRO-PHOTO] Step 5: Direct Gemini response status=${geminiStatus}`);

            if (geminiResp.ok) {
              const geminiData = await geminiResp.json();
              // Gemini Developer API returns inlineData in parts
              const parts = geminiData.candidates?.[0]?.content?.parts || [];
              for (const part of parts) {
                if (part.inlineData?.data) {
                  geminiImageBase64 = part.inlineData.data;
                  geminiImageMime = part.inlineData.mimeType || 'image/jpeg';
                  break;
                }
              }
            } else {
              const errBody = await geminiResp.text().catch(() => '');
              if (geminiStatus === 404) {
                replateSkipReason = `Gemini 404: model "${geminiReplateModel}" not found. Check model name in Platform Admin → Integrations.`;
              } else {
                replateSkipReason = `Gemini API returned ${geminiStatus}: ${errBody.substring(0, 500)}`;
              }
              console.warn(`[PRO-PHOTO] ${replateSkipReason}`);
            }
          }
        }

        // Process the image result (same for both paths)
        if (!replateSkipReason && geminiImageBase64) {
          geminiOutputContentType = geminiImageMime;

          const imgBin = atob(geminiImageBase64);
          const imgBytes = new Uint8Array(imgBin.length);
          for (let i = 0; i < imgBin.length; i++) imgBytes[i] = imgBin.charCodeAt(i);

          // Magic-byte PNG detection (89 50 4E 47 0D 0A 1A 0A) — never trust reported mime
          const isPng = imgBytes.length >= 8
            && imgBytes[0] === 0x89 && imgBytes[1] === 0x50
            && imgBytes[2] === 0x4E && imgBytes[3] === 0x47
            && imgBytes[4] === 0x0D && imgBytes[5] === 0x0A
            && imgBytes[6] === 0x1A && imgBytes[7] === 0x0A;

          console.log(`[PRO-PHOTO] Step 5: Gemini returned image — reported_mime=${geminiImageMime}, magic_bytes_png=${isPng}, size=${imgBytes.length}`);

          if (isPng) {
            // Route through PhotoRoom to flatten transparency onto a solid background
            console.log('[PRO-PHOTO] Step 5.5: PNG detected (magic bytes) — recompositing via PhotoRoom to flatten…');
            const pngBlob = new Blob([imgBytes], { type: 'image/png' });
            const recomposeForm = new FormData();
            recomposeForm.append('imageFile', pngBlob, 'retouched.png');

            const flattenParams = new URLSearchParams();
            flattenParams.set('outputFormat', 'jpg');
            flattenParams.set('lighting.mode', 'ai.auto');
            flattenParams.set('shadow.mode', 'ai.soft');
            if (backgroundBlob) {
              recomposeForm.append('background.image', backgroundBlob, 'background.jpg');
            } else {
              flattenParams.set('background.color', 'F5F5F0');
            }

            const recomposeResult = await callPhotoRoomWithRetry(recomposeForm, flattenParams, photoRoomApiKey);

            if (recomposeResult.ok && recomposeResult.buffer) {
              const { publicUrl: recomposedUrl, storagePath: recomposedPath } = await uploadResultBuffer(
                supabase, venue_id, recomposeResult.buffer, 'final',
              );
              finalUrl = recomposedUrl;
              finalStoragePath = recomposedPath;
              geminiUsed = true;
              console.log(`[PRO-PHOTO] Step 5.5 DONE — PNG flattened to JPEG, final_url: ${finalUrl}`);
            } else {
              console.warn(`[PRO-PHOTO] Recompose failed (${recomposeResult.status}): ${recomposeResult.errorBody} — using composed_url as final`);
              replateSkipReason = `Recompose flattening failed (${recomposeResult.status})`;
            }
          } else {
            // Verified non-PNG (JPEG) — safe to upload directly
            const geminiBuffer = imgBytes.buffer;
            const { publicUrl: geminiUrl, storagePath: geminiPath } = await uploadResultBuffer(
              supabase, venue_id, geminiBuffer, 'final',
            );
            finalUrl = geminiUrl;
            finalStoragePath = geminiPath;
            geminiUsed = true;
            console.log(`[PRO-PHOTO] Step 5 DONE — Gemini JPEG (verified non-PNG) saved as final, final_url: ${finalUrl}`);
          }
        } else if (!replateSkipReason) {
          replateSkipReason = 'Gemini returned no image data';
          console.warn(`[PRO-PHOTO] ${replateSkipReason}, using composed_url as final`);
        }
      } catch (geminiErr) {
        replateSkipReason = `Gemini error: ${geminiErr instanceof Error ? geminiErr.message : 'unknown'}`;
        console.warn('[PRO-PHOTO] Gemini error (non-fatal):', geminiErr);
      }
    }

    // ═══ STEP 6 — Integrity check: final must be .jpg ═══
    if (!finalUrl.endsWith('.jpg')) {
      console.error(`[PRO-PHOTO] INTEGRITY FAIL: final_url does not end in .jpg: ${finalUrl}`);
      finalUrl = composedUrl;
      finalStoragePath = composedStoragePath;
      geminiUsed = false;
    }

    // ═══ STEP 7 — Save results ═══
    const finalImageVariants = {
      square_1_1: finalUrl,
      portrait_4_5: finalUrl,
      vertical_9_16: finalUrl,
    };

    if (job_id) {
      await supabase.from('editor_jobs').update({
        status: 'done',
        final_image_url: finalUrl,
        final_image_variants: finalImageVariants,
        cutout_url: composedUrl,
        replated_url: geminiUsed ? finalUrl : null,
      }).eq('id', job_id);
    }

    await supabase.from('edited_assets').insert({
      venue_id,
      source_url: resolvedSourceUrl,
      output_urls: [finalUrl, composedUrl].filter(Boolean),
      output_types: ['image/jpeg'],
      engine_version: 'v2',
      settings_json: {
        style_preset: brandPreset,
        realism_mode,
        background_mode: backgroundMode,
        background_source_metadata: bgMeta,
        composition_success: compositionSuccess,
        gemini_used: geminiUsed,
        atmosphere_ref_count: bgMeta.asset_id ? 1 : 0,
        background_sent_as_file: !!backgroundBlob,
      },
      created_by: user.id,
      compliance_status: 'approved',
    });

    // Insert to uploads — non-blocking, log errors
    try {
      const { error: uploadErr } = await supabase.from('uploads').insert({
        venue_id,
        storage_path: finalStoragePath,
        uploaded_by: user.id,
        status: 'completed',
        notes: `Pro Photo output (${backgroundMode}${geminiUsed ? ' + AI retouched' : ''})`,
      });
      if (uploadErr) {
        console.warn(`[PRO-PHOTO] uploads insert failed (non-blocking): ${uploadErr.message}`);
      }
    } catch (e) {
      console.warn('[PRO-PHOTO] uploads insert error (non-blocking):', e);
    }

    // ═══ Final diagnostic log (single structured JSON) ═══
    console.log(JSON.stringify({
      tag: 'PRO-PHOTO-RESULT',
      job_id: job_id || 'none',
      venue_id,
      photoroom_key_source: photoRoomResult.source,
      gemini_key_source: replateKeySource,
      background_mode: backgroundMode,
      atmosphere_asset_id: bgMeta.asset_id || 'N/A',
      atmosphere_storage_path: bgMeta.path || 'N/A',
      atmosphere_bucket: bgMeta.bucket || 'N/A',
      public_url: bgMeta.public_url || 'N/A',
      public_url_head_status: bgMeta.public_url_head_status,
      background_blob_size: bgMeta.background_blob_size,
      background_blob_type: bgMeta.background_blob_type,
      background_sent_as_file: !!backgroundBlob,
      photoroom_compose_status: composeResult.status,
      composed_url: composedUrl,
      composed_size_bytes: composeResult.buffer?.byteLength || 0,
      gemini_output_content_type: geminiOutputContentType,
      gemini_used: geminiUsed,
      replate_skip_reason: replateSkipReason,
      final_url: finalUrl,
    }));

    return jsonResp({
      success: true,
      composed_url: composedUrl,
      final_image_url: finalUrl,
      final_image_variants: finalImageVariants,
      background_mode: backgroundMode,
      background_source_metadata: {
        bucket: bgMeta.bucket,
        path: bgMeta.path,
        public_url: bgMeta.public_url,
        head_status: bgMeta.public_url_head_status,
        sent_as_file: !!backgroundBlob,
      },
      composition_success: compositionSuccess,
      gemini_used: geminiUsed,
      replate_skip_reason: replateSkipReason,
    });
  } catch (err: unknown) {
    console.error('[PRO-PHOTO] ERROR:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResp({ error: message }, 500);
  }
});
