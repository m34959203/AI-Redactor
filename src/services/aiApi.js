/**
 * OpenRouter API Service with DeepSeek R1 T2 Chimera
 * Handles all interactions with OpenRouter API
 */

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "tngtech/deepseek-r1t2-chimera:free";

/**
 * Makes a request to OpenRouter API
 * @param {string} prompt - The prompt to send to the AI
 * @param {number} maxTokens - Maximum tokens for the response
 * @returns {Promise<string>} - The response from the AI
 */
const makeAIRequest = async (prompt, maxTokens = 1000) => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("API ключ OpenRouter не найден. Добавьте VITE_OPENROUTER_API_KEY в .env файл");
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "AI Journal Editor"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenRouter API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("OpenRouter API request failed:", error);
    throw error;
  }
};

/**
 * Extracts metadata (title and author) from article content using AI
 * @param {string} fileName - Name of the file
 * @param {string} content - Content of the article
 * @returns {Promise<{title: string, author: string}>}
 */
export const extractMetadataWithAI = async (fileName, content) => {
  const prompt = `Проанализируй этот текст статьи и извлеки:
1. Название статьи (обычно в начале, может быть в верхнем регистре)
2. ФИО автора/авторов (обычно после названия)

Текст файла "${fileName}":
${content.substring(0, 2000)}

Ответь ТОЛЬКО в формате JSON без дополнительного текста:
{
  "title": "название статьи",
  "author": "фамилия автора (только латиница или кириллица)"
}`;

  try {
    const response = await makeAIRequest(prompt, 1000);
    const cleanedResponse = response.replace(/```json|```/g, "").trim();
    const metadata = JSON.parse(cleanedResponse);

    return metadata;
  } catch (error) {
    console.error("AI extraction error:", error);
    return {
      title: fileName.replace('.docx', ''),
      author: 'Неизвестный автор'
    };
  }
};

/**
 * Checks spelling in the content using AI
 * @param {string} content - Content to check
 * @param {string} fileName - Name of the file
 * @returns {Promise<{fileName: string, errors: Array, totalErrors: number}>}
 */
export const checkSpelling = async (content, fileName) => {
  const prompt = `Проверь орфографию в следующем тексте и найди все ошибки:

${content.substring(0, 3000)}

Ответь ТОЛЬКО в формате JSON:
{
  "errors": [
    {"word": "ошибочное слово", "suggestion": "правильное написание", "context": "контекст ошибки"}
  ],
  "totalErrors": число_ошибок
}`;

  try {
    const response = await makeAIRequest(prompt, 2000);
    const cleanedResponse = response.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleanedResponse);

    return {
      fileName,
      ...result
    };
  } catch (error) {
    console.error("Spell check error:", error);
    return { fileName, errors: [], totalErrors: 0 };
  }
};

/**
 * Reviews an article using AI
 * @param {string} content - Article content
 * @param {string} fileName - Name of the file
 * @returns {Promise<Object>} - Review result with scores and recommendations
 */
export const reviewArticle = async (content, fileName) => {
  const prompt = `Проведи рецензию следующей научной статьи и проанализируй по критериям:

Текст статьи:
${content.substring(0, 4000)}

Проанализируй статью по следующим критериям (оценка от 1 до 5):
1. Структура (введение, основная часть, выводы)
2. Логичность изложения
3. Оригинальность исследования
4. Научный стиль
5. Актуальность темы

Ответь в формате JSON:
{
  "structure": {"score": число, "comment": "комментарий"},
  "logic": {"score": число, "comment": "комментарий"},
  "originality": {"score": число, "comment": "комментарий"},
  "style": {"score": число, "comment": "комментарий"},
  "relevance": {"score": число, "comment": "комментарий"},
  "overallScore": средний_балл,
  "summary": "общий вывод рецензии",
  "recommendations": ["рекомендация 1", "рекомендация 2"]
}`;

  try {
    const response = await makeAIRequest(prompt, 3000);
    const cleanedResponse = response.replace(/```json|```/g, "").trim();
    const review = JSON.parse(cleanedResponse);

    return { fileName, ...review };
  } catch (error) {
    console.error("Review error:", error);
    throw new Error("Ошибка при создании рецензии");
  }
};
