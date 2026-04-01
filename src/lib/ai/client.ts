export type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiRole;
  content: string | Array<Record<string, unknown>>;
};

export type AiRequest = {
  model: string;
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

function getGoogleApiKey(): string {
  const key =
    (globalThis as any)?.Deno?.env?.get?.("GOOGLE_AI_API_KEY") ??
    (globalThis as any)?.process?.env?.GOOGLE_AI_API_KEY;

  if (!key) {
    throw new Error("GOOGLE_AI_API_KEY not configured");
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

async function callGoogle(request: AiRequest): Promise<AiNormalizedResponse> {
  const apiKey = getGoogleApiKey();
  const endpoint = `${GOOGLE_API_BASE}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
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

export const aiClient = {
  generateContent(input: AiRequest) {
    return callGoogle(input);
  },
  analyzeImage(input: AiRequest) {
    return callGoogle(input);
  },
  generateCaption(input: AiRequest) {
    return callGoogle(input);
  },
  extractKeywords(input: AiRequest) {
    return callGoogle(input);
  },
};
