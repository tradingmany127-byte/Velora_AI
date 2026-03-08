export async function generateReply({ mode, env, userSettings, chatHistory, userMessage }) {
  if (mode === "pro") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("PRO_NOT_CONFIGURED");
    }
    
    // Здесь будет вызов OpenAI API
    // Пока заглушка
    return "Pro режим временно недоступен. Используйте Free режим.";
  }
  
  // Free режим - локальная модель
  if (!env.LLM_API_URL) {
    throw new Error("LLM_ERROR_NO_URL");
  }
  
  try {
    const response = await fetch(env.LLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: userMessage,
        history: chatHistory.slice(-5), // Последние 5 сообщений
        settings: userSettings
      })
    });
    
    if (!response.ok) {
      throw new Error(`LLM_ERROR_${response.status}`);
    }
    
    const data = await response.json();
    return data.reply || "Извините, произошла ошибка при генерации ответа.";
    
  } catch (error) {
    if (error.message.startsWith("LLM_ERROR_")) {
      throw error;
    }
    throw new Error("LLM_ERROR_CONNECTION");
  }
}
