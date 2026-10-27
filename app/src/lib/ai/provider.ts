// One small seam between the agents and whichever LLM is configured. Any OpenAI-compatible
// /chat/completions endpoint works (OpenAI, Groq, OpenRouter, a local gateway such as OmniRoute, ...).
// No gateway is installed or required: with no configuration every agent uses its rule-based fallback.
//
//   AI_BASE_URL   e.g. https://api.openai.com/v1        (server-only)
//   AI_API_KEY    bearer token                          (server-only, never sent to the browser)
//   AI_MODEL      model name understood by that endpoint
//   AI_TIMEOUT_MS optional, default 8000

export type CompletionResult =
  | { ok: true; text: string }
  | { ok: false; reason: "not-configured" | "timeout" | "rate-limited" | "http-error" | "network" | "empty" };

export interface CompletionRequest { system: string; user: string; json?: boolean; timeoutMs?: number }
export type Provider = (req: CompletionRequest) => Promise<CompletionResult>;

export function providerStatus() {
  const configured = !!(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL);
  return { configured, model: configured ? process.env.AI_MODEL : undefined };
}

const httpProvider: Provider = async ({ system, user, json, timeoutMs }) => {
  const { AI_BASE_URL: base, AI_API_KEY: key, AI_MODEL: model } = process.env;
  if (!base || !key || !model) return { ok: false, reason: "not-configured" };
  const ac = new AbortController();
  const limit = timeoutMs ?? (Number(process.env.AI_TIMEOUT_MS) || 8000);
  const timer = setTimeout(() => ac.abort(), limit);
  try {
    const r = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal: ac.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 500,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (r.status === 429) return { ok: false, reason: "rate-limited" };
    if (!r.ok) return { ok: false, reason: "http-error" };
    const body = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
    const text = body.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? { ok: true, text: text.trim() } : { ok: false, reason: "empty" };
  } catch (e) {
    return { ok: false, reason: (e as Error).name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
};

let impl: Provider = httpProvider;
/** Test seam: swap the provider (pass nothing to restore the HTTP one). */
export const setProvider = (p?: Provider) => { impl = p ?? httpProvider; };

/** Never throws: any failure becomes `{ ok: false }` so callers fall back to rules. */
export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  try {
    return await impl(req);
  } catch {
    return { ok: false, reason: "network" };
  }
}
