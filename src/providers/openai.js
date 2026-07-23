export async function callOpenAI({
  apiKey,
  model,
  baseUrl,
  effort,
  system,
  userText,
  imageBase64,
  extraHeaders = {},
  jsonMode = false,
  maxTokens = 700,
  timeoutMs = 55_000,
}) {
  const root = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const content = [{ type: "text", text: userText }];
  if (imageBase64) {
    const url = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;
    content.push({ type: "image_url", image_url: { url } });
  }
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    temperature: 0.45,
    max_tokens: maxTokens,
  };
  if (effort) payload.reasoning_effort = effort;
  if (jsonMode) payload.response_format = { type: "json_object" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${root}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(
        new Error(
          "The diary took too long to answer (model timeout). Try Speak again, or set OPENROUTER_MODEL on Vercel to a faster vision model such as google/gemini-2.0-flash-001."
        ),
        { status: 504 }
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.metadata?.raw ||
      (typeof data?.error === "string" ? data.error : null) ||
      `OpenAI-compatible error ${response.status}`;
    throw Object.assign(new Error(String(message)), { status: response.status });
  }
  const raw = data?.choices?.[0]?.message?.content;
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (Array.isArray(raw)) {
    text = raw.map((part) => (typeof part === "string" ? part : part?.text || "")).join("");
  }
  if (!text) throw new Error("Provider returned an empty response");
  return text;
}
