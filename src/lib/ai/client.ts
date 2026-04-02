export type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiRole;
  content: string | Array<Record<string, unknown>>;
};

/** AI task types for centralized model routing */
export type AiTask =
  // Image tasks
  | 'image_generate'
  | 'image_edit'
  | 'pro_photo'
  | 'image_variation'
  // High-quality text
  | 'campaign'
  | 'long_form'
  // Standard text
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

export type AiRequest = {
  /** Task type — determines which model to use via centralized routing */
  task?: AiTask;
  /** Override model (bypasses task routing if provided) */
  model?: string;
  messages: AiMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
  gatewayUrl?: string;
};

export type AiNormalizedResponse = {
  content: string;
  raw?: any;
};

export class AiClientError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`AI request failed: ${status}`);
    this.status = status;
    this.body = body;
  }
}

const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_RETRIES = 1;

/**
 * Returns the optimal model for a given task.
 * All tasks route through a single GOOGLE_AI_API_KEY.
 */
export function getModelForTask(task: AiTask): string {
  switch (task) {
    case 'image_generate':
    case 'image_edit':
    case 'pro_photo':
    case 'image_variation':
      return 'gemini-2.5-flash-image';

    case 'campaign':
    case 'long_form':
    case 'marketing_plan':
    case 'event_plan':
      return 'gemini-2.5-flash';

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
      return 'gemini-2.5-flash';

    case 'bulk_autopilot':
    case 'tagging':
    case 'action_feed':
      return 'gemini-2.5-flash-lite';

    default:
      return 'gemini-2.5-flash';
  }
}

function getGoogleApiKey(): string {
  const key =
    (globalThis as any)?.Deno?.env?.get?.("GOOGLE_AI_API_KEY") ??
    (globalThis as any)?.process?.env?.GOOGLE_AI_API_KEY;

  if (!key) {
    throw new Error("AI not configured. Set GOOGLE_AI_API_KEY in Admin → Integrations.");
  }

  return key;
}

function stripMarkdownCodeFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function safeJsonParse(value: string): { parsed?: unknown; error?: string } {
  const stripped = stripMarkdownCodeFences(value);
  if (!stripped) return {};

  try {
    return { parsed: JSON.parse(stripped) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Invalid JSON output",
    };
  }
}

function toInlineDataPart(url: string): Record<string, unknown> | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;

  const [, mimeType, data] = match;
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

function normalizeTextPart(part: Record<string, unknown>): string {
  return typeof part.text === "string" ? part.text : "";
}

function mapOpenAiLikePartToGeminiPart(part: Record<string, unknown>): Record<string, unknown>[] {
  const type = typeof part.type === "string" ? part.type : "";

  if (type === "text") {
    return [{ text: normalizeTextPart(part) }];
  }

  if (type === "image_url") {
    const imageUrl = part.image_url as { url?: string } | string | undefined;
    const url = typeof imageUrl === "string" ? imageUrl : imageUrl?.url;

    if (typeof url === "string") {
      const inlineData = toInlineDataPart(url);
      if (inlineData) return [inlineData];
      return [{ fileData: { fileUri: url } }];
    }
  }

  if (typeof part.text === "string") {
    return [{ text: part.text }];
  }

  if (typeof part.inlineData === "object" && part.inlineData !== null) {
    return [{ inlineData: part.inlineData }];
  }

  return [];
}

function mapMessageContentToGeminiParts(content: AiMessage["content"]): Record<string, unknown>[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  return content.flatMap((part) => mapOpenAiLikePartToGeminiPart(part));
}

function toGeminiRole(role: AiRole): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

function buildGeminiRequest(request: AiRequest): Record<string, unknown> {
  const systemInstructions = request.messages
    .filter((message) => message.role === "system")
    .flatMap((message) => mapMessageContentToGeminiParts(message.content));

  const contents = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: toGeminiRole(message.role),
      parts: mapMessageContentToGeminiParts(message.content),
    }));

  const generationConfig: Record<string, unknown> = {
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.max_tokens !== undefined ? { maxOutputTokens: request.max_tokens } : {}),
  };

  if (request.response_format) {
    generationConfig.responseMimeType = "application/json";

    const schema =
      (request.response_format as any)?.json_schema?.schema ??
      (request.response_format as any)?.schema;

    if (schema && typeof schema === "object") {
      generationConfig.responseSchema = schema;
    }
  }

  return {
    ...(systemInstructions.length
      ? { systemInstruction: { role: "user", parts: systemInstructions } }
      : {}),
    contents,
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };
}

function normalizeGeminiContent(raw: any): string {
  const candidate = raw?.candidates?.[0];
  const parts = candidate?.content?.parts;

  if (Array.isArray(parts)) {
    const text = parts
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

function resolveModelFromRequest(request: AiRequest): string {
  // Explicit model takes priority
  if (request.model) return request.model;
  // Task-based routing
  if (request.task) return getModelForTask(request.task);
  // Fallback
  return 'gemini-2.5-flash';
}

async function callGoogle(request: AiRequest): Promise<AiNormalizedResponse> {
  const apiKey = getGoogleApiKey();
  const model = resolveModelFromRequest(request);
  const endpoint = `${GOOGLE_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = buildGeminiRequest(request);

  let lastError: unknown;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new AiClientError(
          response.status,
          errorText || "Google AI request failed without response body",
        );
      }

      const raw = await response.json();
      const content = normalizeGeminiContent(raw);
      const jsonResult = safeJsonParse(content);

      return {
        content,
        raw: {
          ...raw,
          normalized: {
            content,
            ...(jsonResult.parsed !== undefined ? { parsedJson: jsonResult.parsed } : {}),
            ...(jsonResult.error ? { parseError: jsonResult.error } : {}),
          },
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt < DEFAULT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }

  if (lastError instanceof AiClientError) {
    throw lastError;
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown Google AI error";
  throw new Error(`Google AI request failed: ${message}`);
}

/**
 * Unified AI client. Use `task` for automatic model routing,
 * or `model` for explicit model selection.
 *
 * @example
 * // Task-based (recommended)
 * aiClient.run({ task: 'caption', messages: [...] })
 *
 * // Explicit model (override)
 * aiClient.run({ model: 'gemini-2.5-flash', messages: [...] })
 */
export const aiClient = {
  run(input: AiRequest) {
    return callGoogle(input);
  },
  /** @deprecated Use run() with task parameter */
  generateContent(input: AiRequest) {
    return callGoogle(input);
  },
  /** @deprecated Use run() with task: 'style_analysis' */
  analyzeImage(input: AiRequest) {
    return callGoogle(input);
  },
  /** @deprecated Use run() with task: 'caption' */
  generateCaption(input: AiRequest) {
    return callGoogle(input);
  },
  /** @deprecated Use run() with task: 'tagging' */
  extractKeywords(input: AiRequest) {
    return callGoogle(input);
  },
};
