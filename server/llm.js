function buildSystemPrompt(settings) {
  const tone = settings?.tone || "soft";     // soft | neutral | tough
  const length = settings?.length || "normal"; // short | normal | long
  const lang = settings?.language || "ru";

  const toneLine =
    tone === "tough" ? "Тон: жёсткий, прямой, но без оскорблений." :
    tone === "neutral" ? "Тон: нейтральный, деловой." :
    "Тон: мягкий, тёплый, поддерживающий.";

  const lengthLine =
    length === "short" ? "Длина: кратко и по делу." :
    length === "long" ? "Длина: подробно, с шагами и примерами." :
    "Длина: нормально, без воды.";

  const langLine = `Язык ответа: ${lang.toUpperCase()}.`;

  return `Ты — Velora AI, премиальный ассистент. ${toneLine} ${lengthLine} ${langLine}
Дай пользователю максимально полезный ответ. Если задача неясна — задай 1 уточняющий вопрос.`;
}

async function callOpenAIStyle({ baseUrl, apiKey, model, messages, temperature = 0.7 }) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature
    })
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`LLM_ERROR_${r.status}: ${t.slice(0, 300)}`);
  }

  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM_EMPTY_REPLY");
  return content;
}

export async function generateReply({ mode, env, userSettings, chatHistory, userMessage }) {
  const system = buildSystemPrompt(userSettings);

  const messages = [
    { role: "system", content: system },
    ...(chatHistory || []).slice(-12), // ограничим контекст
    { role: "user", content: userMessage }
  ];

  if (mode === "pro") {
    if (!env.OPENAI_API_KEY) throw new Error("PRO_NOT_CONFIGURED");
    return callOpenAIStyle({
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages
    });
  }

  // free
  return callOpenAIStyle({
    baseUrl: env.LOCAL_LLM_BASE_URL,
    apiKey: null,
    model: env.LOCAL_LLM_MODEL || "mistral-7b-instruct",
    messages
  });
}