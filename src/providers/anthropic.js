export async function callAnthropic({ apiKey, model, effort, system, userText, imageBase64 }) {
  const content = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      },
    });
  }
  content.push({ type: "text", text: userText });
  const payload = {
    model,
    max_tokens: effort === "high" ? 8192 : 4096,
    system,
    messages: [{ role: "user", content }],
  };
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Anthropic error ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  const text = (data?.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (!text) throw new Error("Anthropic returned an empty response");
  return text;
}
