import { GoogleGenAI } from "@google/genai";
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});
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
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7
    });
  }

  // Default: Gemini mode
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_NOT_CONFIGURED");
  }

  const prompt = messages
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

  console.log(`[LLM] Sending to Gemini, prompt length: ${prompt.length}`);

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });

    if (!response) {
      console.error("[LLM] Gemini returned null response");
      throw new Error("AI returned null response");
    }

    if (!response.text) {
      console.error("[LLM] Gemini returned response without text field");
      throw new Error("AI returned empty response");
    }

    const reply = response.text;
    if (!reply || typeof reply !== 'string' || reply.trim() === '') {
      console.error("[LLM] Gemini returned empty or invalid text");
      throw new Error("AI returned empty response");
    }

    console.log(`[LLM] Gemini success, reply length: ${reply.length}`);
    return reply;

  } catch (err) {
    console.error("[LLM] Gemini API error:", err);
    
    // Обработка специфичных ошибок Gemini
    if (err.message?.includes("quota") || err.message?.includes("rate") || err.message?.includes("429")) {
      throw new Error("quota exceeded");
    }
    
    if (err.message?.includes("network") || err.message?.includes("timeout") || err.message?.includes("ECONNRESET")) {
      throw new Error("network error");
    }
    
    if (err.message?.includes("permission") || err.message?.includes("forbidden") || err.message?.includes("403")) {
      throw new Error("API key invalid");
    }
    
    if (err.message?.includes("not found") || err.message?.includes("404")) {
      throw new Error("model not available");
    }
    
    // Для всех остальных ошибок пробрасываем дальше
    throw err;
  }
}