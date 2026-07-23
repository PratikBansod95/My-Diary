export async function callOpenAI({
  apiKey,
  model,
  baseUrl,
  effort,
  system,
  userText,
  imageBase64,
  extraHeaders = {},
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
    const message = data?.error?.message || `OpenAI-compatible error ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("OpenAI-compatible provider returned an empty response");
  return text;
}

