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

const DEFAULT_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function getLovableApiKey(): string {
  const key =
    (globalThis as any)?.Deno?.env?.get?.("LOVABLE_API_KEY") ??
    (globalThis as any)?.process?.env?.LOVABLE_API_KEY;

  if (!key) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  return key;
}

async function callLovable(request: AiRequest): Promise<AiNormalizedResponse> {
  const response = await fetch(request.gatewayUrl ?? DEFAULT_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getLovableApiKey()}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.max_tokens !== undefined ? { max_tokens: request.max_tokens } : {}),
      ...(request.response_format ? { response_format: request.response_format } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AiClientError(response.status, body);
  }

  const raw = await response.json();
  const content = raw?.choices?.[0]?.message?.content;

  return {
    content: typeof content === "string" ? content : "",
    raw,
  };
}

export const aiClient = {
  generateContent(input: AiRequest) {
    return callLovable(input);
  },
  analyzeImage(input: AiRequest) {
    return callLovable(input);
  },
  generateCaption(input: AiRequest) {
    return callLovable(input);
  },
  extractKeywords(input: AiRequest) {
    return callLovable(input);
  },
};
