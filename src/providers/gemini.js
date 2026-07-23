export async function callGemini({ apiKey, model, system, userText, imageBase64, jsonMode = true }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts = [{ text: `${system}\n\n${userText}` }];
  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      },
    });
  }
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.4,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini error ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}
