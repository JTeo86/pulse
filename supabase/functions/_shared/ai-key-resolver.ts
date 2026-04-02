/**
 * Shared AI key resolver + model router for all Pulse edge functions.
 *
 * Resolution order:
 * 1. GOOGLE_AI_API_KEY from platform_api_keys table (user-configured)
 *    → Uses Google Gemini OpenAI-compatible endpoint
 * 2. LOVABLE_API_KEY from environment (built-in)
 *    → Uses Lovable AI Gateway
 *
 * Both endpoints accept OpenAI-compatible request format, so callers
 * don't need to change their request body shape.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  /** If using stored Google key, strip "google/" prefix from model names */
  stripModelPrefix: boolean;
  source: 'platform_api_keys' | 'lovable_gateway';
}

/** AI task types for model routing */
export type AiTask =
  // Image tasks
  | 'image_generate'
  | 'image_edit'
  | 'pro_photo'
  | 'image_variation'
  // High-quality text (important content)
  | 'campaign'
  | 'long_form'
  // Standard text (default)
  | 'caption'
  | 'autopilot'
  | 'review_response'
  | 'analysis'
  | 'copy_generate'
  | 'copy_refine'
  | 'event_plan'
  | 'marketing_plan'
  | 'style_analysis'
  | 'guest_enhance'
  | 'revenue_brief'
  | 'weekly_report'
  // Cheap bulk tasks
  | 'bulk_autopilot'
  | 'tagging'
  | 'action_feed';

/**
 * Returns the optimal Gemini model ID for a given task.
 * Uses google/ prefix for gateway compatibility; stripped when using direct API.
 */
export function getModelForTask(task: AiTask): string {
  switch (task) {
    // Image tasks — require image-capable model
    case 'image_generate':
    case 'image_edit':
    case 'pro_photo':
    case 'image_variation':
      return 'google/gemini-2.5-flash-image';

    // High-quality text — important content
    case 'campaign':
    case 'long_form':
    case 'marketing_plan':
    case 'event_plan':
      return 'google/gemini-2.5-flash';

    // Standard text — good balance
    case 'caption':
    case 'autopilot':
    case 'review_response':
    case 'analysis':
    case 'copy_generate':
    case 'copy_refine':
    case 'style_analysis':
    case 'guest_enhance':
    case 'revenue_brief':
    case 'weekly_report':
      return 'google/gemini-2.5-flash';

    // Cheap bulk tasks
    case 'bulk_autopilot':
    case 'tagging':
    case 'action_feed':
      return 'google/gemini-2.5-flash-lite';

    default:
      return 'google/gemini-2.5-flash';
  }
}

/**
 * Resolves AI credentials. Returns the API key and base URL to use.
 * Throws if no AI key is available at all.
 */
export async function resolveAiConfig(): Promise<AiConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Try platform_api_keys first
  if (supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data } = await supabase
        .from('platform_api_keys')
        .select('key_value')
        .eq('key_name', 'GOOGLE_AI_API_KEY')
        .eq('is_configured', true)
        .single();

      const keyValue = data?.key_value?.trim();
      if (keyValue) {
        console.log('[AI-RESOLVER] Using GOOGLE_AI_API_KEY from platform_api_keys');
        return {
          apiKey: keyValue,
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          stripModelPrefix: true,
          source: 'platform_api_keys',
        };
      }
    } catch {
      // Fall through to LOVABLE_API_KEY
    }
  }

  // Fallback to LOVABLE_API_KEY
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (lovableKey) {
    console.log('[AI-RESOLVER] Using LOVABLE_API_KEY (gateway fallback)');
    return {
      apiKey: lovableKey,
      baseUrl: 'https://ai.gateway.lovable.dev/v1',
      stripModelPrefix: false,
      source: 'lovable_gateway',
    };
  }

  throw new Error('AI not configured. Set GOOGLE_AI_API_KEY in Admin → Integrations or contact support.');
}

/**
 * Resolves the model name based on the AI config.
 * When using the direct Google API, strips the "google/" prefix.
 */
export function resolveModel(model: string, config: AiConfig): string {
  if (config.stripModelPrefix && model.startsWith('google/')) {
    return model.replace(/^google\//, '');
  }
  return model;
}

/**
 * Resolves model for a task, applying config-based prefix stripping.
 */
export function resolveModelForTask(task: AiTask, config: AiConfig): string {
  return resolveModel(getModelForTask(task), config);
}

/**
 * Builds the full chat completions URL.
 */
export function chatCompletionsUrl(config: AiConfig): string {
  return `${config.baseUrl}/chat/completions`;
}
