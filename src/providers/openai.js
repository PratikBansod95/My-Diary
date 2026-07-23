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
}) {
  const root = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const content = [{ type: "text", text: userText }];
  if (imageBase64) {
    const url = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;
    content.push({ type: "image_url", image_url: { url } });
  }
  const payload = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    temperature: 0.4,
  };
  if (effort) payload.reasoning_effort = effort;
  if (jsonMode) payload.response_format = { type: "json_object" };

  const response = await fetch(`${root}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
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
