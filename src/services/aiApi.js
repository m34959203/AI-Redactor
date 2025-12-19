/**
 * OpenRouter API Service with DeepSeek R1 T2 Chimera
 * Handles all interactions with OpenRouter API
 */

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "tngtech/deepseek-r1t2-chimera:free";
// Fallback model if primary fails
const FALLBACK_MODEL = "deepseek/deepseek-chat:free";

/**
 * Extracts JSON from AI response that may contain <think> tags or other text
 * @param {string} response - Raw AI response
 * @returns {string} - Cleaned JSON string
 */
const extractJsonFromResponse = (response) => {
  if (!response) return '{}';

  let cleaned = response;

  // Remove <think>...</think> blocks (DeepSeek R1 reasoning)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Remove markdown code blocks
  cleaned = cleaned.replace(/```json\s*/gi, '');
  cleaned = cleaned.replace(/```\s*/gi, '');

  // Try to extract JSON object from text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  return cleaned.trim();
};

/**
 * Makes a request to OpenRouter API
 * @param {string} prompt - The prompt to send to the AI
 * @param {number} maxTokens - Maximum tokens for the response
 * @param {boolean} useFallback - Whether to use fallback model
 * @returns {Promise<string>} - The response from the AI
 */
const makeAIRequest = async (prompt, maxTokens = 1000, useFallback = false) => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("API ключ OpenRouter не найден. Добавьте VITE_OPENROUTER_API_KEY в .env файл");
  }

  const model = useFallback ? FALLBACK_MODEL : MODEL;

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
        model: model,
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
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;

      // If primary model fails, try fallback
      if (!useFallback && (response.status === 429 || response.status >= 500)) {
        console.warn(`Primary model failed (${response.status}), trying fallback...`);
        return makeAIRequest(prompt, maxTokens, true);
      }

      throw new Error(`OpenRouter API error: ${errorMessage}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid API response structure');
    }

    return data.choices[0].message.content;
  } catch (error) {
    // Try fallback on network errors
    if (!useFallback && error.name === 'TypeError') {
      console.warn('Network error, trying fallback model...');
      return makeAIRequest(prompt, maxTokens, true);
    }

    console.error("OpenRouter API request failed:", error);
    throw error;
  }
};

/**
 * Safely parses JSON with fallback values
 * @param {string} jsonString - JSON string to parse
 * @param {Object} fallback - Fallback object if parsing fails
 * @returns {Object} - Parsed object or fallback
 */
const safeJsonParse = (jsonString, fallback = {}) => {
  try {
    const cleaned = extractJsonFromResponse(jsonString);
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('JSON parse error:', error, 'Raw:', jsonString?.substring(0, 500));
    return fallback;
  }
};

/**
 * Extracts metadata (title and author) from article content using AI
 * @param {string} fileName - Name of the file
 * @param {string} content - Content of the article
 * @returns {Promise<{title: string, author: string}>}
 */
export const extractMetadataWithAI = async (fileName, content) => {
  const prompt = `Проанализируй этот текст статьи и извлеки название и автора.

Текст файла "${fileName}":
${content.substring(0, 2000)}

Ответь ТОЛЬКО JSON без пояснений:
{"title": "название статьи", "author": "ФИО автора"}`;

  const fallback = {
    title: fileName.replace('.docx', ''),
    author: 'Неизвестный автор'
  };

  try {
    const response = await makeAIRequest(prompt, 500);
    const metadata = safeJsonParse(response, fallback);

    return {
      title: metadata.title || fallback.title,
      author: metadata.author || fallback.author
    };
  } catch (error) {
    console.error("AI extraction error:", error);
    return fallback;
  }
};

/**
 * Checks spelling in the content using AI
 * @param {string} content - Content to check
 * @param {string} fileName - Name of the file
 * @returns {Promise<{fileName: string, errors: Array, totalErrors: number}>}
 */
export const checkSpelling = async (content, fileName) => {
  const prompt = `Проверь орфографию в тексте и найди ошибки.

Текст:
${content.substring(0, 3000)}

Ответь ТОЛЬКО JSON:
{"errors": [{"word": "ошибка", "suggestion": "исправление", "context": "контекст"}], "totalErrors": 0}`;

  const fallback = { errors: [], totalErrors: 0 };

  try {
    const response = await makeAIRequest(prompt, 1500);
    const result = safeJsonParse(response, fallback);

    return {
      fileName,
      errors: Array.isArray(result.errors) ? result.errors : [],
      totalErrors: typeof result.totalErrors === 'number' ? result.totalErrors : (result.errors?.length || 0)
    };
  } catch (error) {
    console.error("Spell check error:", error);
    return { fileName, ...fallback };
  }
};

/**
 * Reviews an article using AI
 * @param {string} content - Article content
 * @param {string} fileName - Name of the file
 * @returns {Promise<Object>} - Review result with scores and recommendations
 */
export const reviewArticle = async (content, fileName) => {
  const prompt = `Проведи рецензию научной статьи.

Текст:
${content.substring(0, 4000)}

Оцени по критериям (1-5): структура, логика, оригинальность, стиль, актуальность.

Ответь ТОЛЬКО JSON:
{
  "structure": {"score": 3, "comment": "комментарий"},
  "logic": {"score": 3, "comment": "комментарий"},
  "originality": {"score": 3, "comment": "комментарий"},
  "style": {"score": 3, "comment": "комментарий"},
  "relevance": {"score": 3, "comment": "комментарий"},
  "overallScore": 3,
  "summary": "общий вывод",
  "recommendations": ["рекомендация"]
}`;

  const fallback = {
    structure: { score: 3, comment: "Не удалось проанализировать" },
    logic: { score: 3, comment: "Не удалось проанализировать" },
    originality: { score: 3, comment: "Не удалось проанализировать" },
    style: { score: 3, comment: "Не удалось проанализировать" },
    relevance: { score: 3, comment: "Не удалось проанализировать" },
    overallScore: 3,
    summary: "Не удалось создать рецензию. Попробуйте позже.",
    recommendations: []
  };

  try {
    const response = await makeAIRequest(prompt, 2000);
    const review = safeJsonParse(response, null);

    if (!review || !review.structure) {
      console.error('Invalid review structure, using fallback');
      return { fileName, ...fallback };
    }

    // Validate and normalize the review
    const normalizedReview = {
      structure: review.structure || fallback.structure,
      logic: review.logic || fallback.logic,
      originality: review.originality || fallback.originality,
      style: review.style || fallback.style,
      relevance: review.relevance || fallback.relevance,
      overallScore: typeof review.overallScore === 'number' ? review.overallScore : 3,
      summary: review.summary || fallback.summary,
      recommendations: Array.isArray(review.recommendations) ? review.recommendations : []
    };

    return { fileName, ...normalizedReview };
  } catch (error) {
    console.error("Review error:", error);
    // Return fallback instead of throwing
    return { fileName, ...fallback };
  }
};
