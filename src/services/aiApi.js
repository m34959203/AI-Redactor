/**
 * OpenRouter API Service with improved prompts
 * Supports Russian, English, and Kazakh languages
 */

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "tngtech/deepseek-r1t2-chimera:free";
const FALLBACK_MODEL = "deepseek/deepseek-r1:free"; // Updated to working model

// System prompt for consistent AI behavior
const SYSTEM_PROMPT = `Ты - помощник редактора научного журнала.
Ты анализируешь научные статьи на русском, английском и казахском языках.
Всегда отвечай ТОЛЬКО в формате JSON без дополнительного текста.
Не добавляй пояснения до или после JSON.`;

/**
 * Extracts JSON from AI response that may contain <think> tags or other text
 */
const extractJsonFromResponse = (response) => {
  if (!response) return '{}';

  // FIRST: Try to find JSON in the response before any cleanup
  // This prevents regex from accidentally deleting JSON content

  // Look for JSON that starts after </think> or at beginning
  let jsonContent = response;

  // Find the last occurrence of </think> and take everything after it
  const thinkEndIndex = response.lastIndexOf('</think>');
  if (thinkEndIndex !== -1) {
    jsonContent = response.substring(thinkEndIndex + 8); // 8 = length of '</think>'
  } else {
    // No closing think tag - try to find JSON directly
    // Look for first { that might be JSON (after any <think> content)
    const thinkStartIndex = response.indexOf('<think>');
    if (thinkStartIndex !== -1) {
      // Find JSON after the think tag or before it
      const beforeThink = response.substring(0, thinkStartIndex);
      const jsonInBefore = beforeThink.match(/\{[\s\S]*\}/);
      if (jsonInBefore) {
        jsonContent = jsonInBefore[0];
      } else {
        // Try to find JSON that might be mixed with incomplete think content
        // Extract everything that looks like JSON
        const jsonMatch = response.match(/\{[^<]*"(?:structure|title)"[\s\S]*?\}(?=\s*$|\s*<)/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
      }
    }
  }

  // Clean up any remaining tags and markdown
  let cleaned = jsonContent;
  cleaned = cleaned.replace(/<\/?think>/gi, '');
  cleaned = cleaned.replace(/```json\s*/gi, '');
  cleaned = cleaned.replace(/```\s*/gi, '');
  cleaned = cleaned.trim();

  // Try to extract complete JSON object using balanced braces
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let lastBrace = -1;
    for (let i = firstBrace; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          lastBrace = i;
          break;
        }
      }
    }
    if (lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  return cleaned || '{}';
};

/**
 * Makes a request to OpenRouter API with system prompt
 */
const makeAIRequest = async (prompt, maxTokens = 1000, useFallback = false) => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
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
            role: "system",
            content: SYSTEM_PROMPT
          },
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

      // 401 = invalid API key, don't retry
      if (response.status === 401) {
        throw new Error("API_KEY_INVALID");
      }

      // Retry with fallback on rate limit, server errors, or model not found (404)
      if (!useFallback && (response.status === 404 || response.status === 429 || response.status >= 500)) {
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
    // Don't retry on auth errors
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      throw error;
    }

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
 * Supports Russian, English, and Kazakh articles
 */
export const extractMetadataWithAI = async (fileName, content) => {
  const prompt = `Извлеки метаданные из научной статьи.

ПРАВИЛА ИЗВЛЕЧЕНИЯ:
1. Название статьи обычно в начале документа
   - Может быть ЗАГЛАВНЫМИ БУКВАМИ
   - Может быть на русском, английском или казахском языке
2. Автор(ы) указаны после названия
   - Формат: "Фамилия И.О." или "И.О. Фамилия" или "Surname N."
   - Если несколько авторов - укажи только первого
3. Если название или автор не найдены - верни null для этого поля

ПРИМЕРЫ:
Вход: "ВЛИЯНИЕ КЛИМАТА НА ЭКОСИСТЕМУ\\nИванов А.Б., Петров В.Г.\\nАннотация..."
Выход: {"title": "Влияние климата на экосистему", "author": "Иванов А.Б."}

Вход: "ҚАЗАҚСТАНДАҒЫ ЭКОЛОГИЯ МӘСЕЛЕЛЕРІ\\nСәрсенбаев Қ.М.\\nКіріспе..."
Выход: {"title": "Қазақстандағы экология мәселелері", "author": "Сәрсенбаев Қ.М."}

Вход: "CLIMATE CHANGE IMPACTS\\nSmith J., Brown A.\\nAbstract..."
Выход: {"title": "Climate Change Impacts", "author": "Smith J."}

ТЕКСТ СТАТЬИ (файл "${fileName}"):
${content.substring(0, 2500)}

Ответь JSON: {"title": "...", "author": "..."}`;

  const fallback = {
    title: fileName.replace('.docx', '').replace(/_/g, ' '),
    author: 'Автор не указан'
  };

  try {
    const response = await makeAIRequest(prompt, 600);
    const metadata = safeJsonParse(response, fallback);

    return {
      title: metadata.title || fallback.title,
      author: metadata.author || fallback.author
    };
  } catch (error) {
    console.error("AI extraction error:", error);
    // Show API config message in author field to alert user
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      return {
        title: fallback.title,
        author: '⚠️ API ключ не настроен'
      };
    }
    return fallback;
  }
};

/**
 * Checks spelling in the content using AI
 * Supports Russian, English, and Kazakh text
 */
export const checkSpelling = async (content, fileName) => {
  const prompt = `Проверь орфографию в научном тексте.

ПРАВИЛА ПРОВЕРКИ:
1. Поддерживаемые языки: русский, английский, казахский
2. Игнорируй:
   - Специальные термины и аббревиатуры (DNA, РНК, ЖИК)
   - Имена собственные и названия
   - Формулы и числа
3. Найди до 15 самых явных орфографических ошибок
4. Для каждой ошибки укажи контекст (3-5 слов вокруг)

ПРИМЕР ОТВЕТА:
{
  "errors": [
    {"word": "эксперемент", "suggestion": "эксперимент", "context": "...провести эксперемент в лаборатории..."},
    {"word": "ресурс", "suggestion": "ресурсы", "context": "...природные ресурс истощаются..."}
  ],
  "totalErrors": 2
}

Если ошибок нет: {"errors": [], "totalErrors": 0}

ТЕКСТ ДЛЯ ПРОВЕРКИ:
${content.substring(0, 4000)}

Ответь JSON:`;

  const fallback = { errors: [], totalErrors: 0 };

  try {
    const response = await makeAIRequest(prompt, 2000);
    const result = safeJsonParse(response, fallback);

    return {
      fileName,
      errors: Array.isArray(result.errors) ? result.errors : [],
      totalErrors: typeof result.totalErrors === 'number'
        ? result.totalErrors
        : (result.errors?.length || 0)
    };
  } catch (error) {
    console.error("Spell check error:", error);
    // Return informative message when API is not configured
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      return {
        fileName,
        errors: [{
          word: "⚠️",
          suggestion: "Настройте API ключ OpenRouter",
          context: "AI проверка орфографии недоступна без API ключа"
        }],
        totalErrors: 0,
        apiError: true
      };
    }
    return { fileName, ...fallback };
  }
};

/**
 * Reviews an article using AI with detailed scoring criteria
 * Supports Russian, English, and Kazakh articles
 */
export const reviewArticle = async (content, fileName) => {
  const prompt = `Проведи экспертную рецензию научной статьи.

ШКАЛА ОЦЕНОК (1-5):
1 - Неприемлемо: критические недостатки, требует полной переработки
2 - Слабо: существенные проблемы, много доработок
3 - Удовлетворительно: есть замечания, требует правок
4 - Хорошо: незначительные замечания
5 - Отлично: соответствует высоким стандартам

КРИТЕРИИ ОЦЕНКИ:
1. СТРУКТУРА (structure): наличие введения, методологии, результатов, выводов
2. ЛОГИКА (logic): последовательность аргументации, обоснованность выводов
3. ОРИГИНАЛЬНОСТЬ (originality): новизна исследования, научный вклад
4. СТИЛЬ (style): научный язык, терминология, грамотность
5. АКТУАЛЬНОСТЬ (relevance): современность темы, практическая значимость

ПРИМЕР РЕЦЕНЗИИ:
{
  "structure": {"score": 4, "comment": "Структура соответствует требованиям, введение информативное"},
  "logic": {"score": 3, "comment": "Выводы недостаточно обоснованы результатами"},
  "originality": {"score": 4, "comment": "Предложен новый подход к решению проблемы"},
  "style": {"score": 5, "comment": "Текст написан грамотным научным языком"},
  "relevance": {"score": 4, "comment": "Тема актуальна для современной науки"},
  "overallScore": 4,
  "summary": "Статья соответствует требованиям научного журнала с небольшими доработками",
  "recommendations": ["Усилить обоснование выводов", "Добавить больше ссылок на источники"]
}

ТЕКСТ СТАТЬИ (${fileName}):
${content.substring(0, 5000)}

Проведи рецензию и ответь JSON:`;

  const fallback = {
    structure: { score: 0, comment: "Анализ недоступен" },
    logic: { score: 0, comment: "Анализ недоступен" },
    originality: { score: 0, comment: "Анализ недоступен" },
    style: { score: 0, comment: "Анализ недоступен" },
    relevance: { score: 0, comment: "Анализ недоступен" },
    overallScore: 0,
    summary: "Не удалось создать рецензию. Попробуйте позже.",
    recommendations: []
  };

  const apiErrorFallback = {
    structure: { score: 0, comment: "API ключ не настроен" },
    logic: { score: 0, comment: "API ключ не настроен" },
    originality: { score: 0, comment: "API ключ не настроен" },
    style: { score: 0, comment: "API ключ не настроен" },
    relevance: { score: 0, comment: "API ключ не настроен" },
    overallScore: 0,
    summary: "⚠️ AI рецензирование недоступно. Настройте API ключ OpenRouter в переменных окружения (VITE_OPENROUTER_API_KEY).",
    recommendations: ["Получите API ключ на openrouter.ai", "Добавьте ключ в настройки Railway"],
    apiError: true
  };

  // Helper to try parsing review
  const tryParseReview = async (useFallbackModel = false) => {
    const response = await makeAIRequest(prompt, 2500, useFallbackModel);
    return safeJsonParse(response, null);
  };

  try {
    let review = await tryParseReview(false);

    // Retry with fallback model if first attempt failed
    if (!review || !review.structure) {
      console.warn('First review attempt failed, retrying with fallback model...');
      review = await tryParseReview(true);
    }

    if (!review || !review.structure) {
      console.error('Invalid review structure after retry, using fallback');
      return { fileName, ...fallback };
    }

    // Validate and normalize scores (clamp to 1-5)
    const clampScore = (score) => Math.max(1, Math.min(5, Number(score) || 3));

    const normalizedReview = {
      structure: {
        score: clampScore(review.structure?.score),
        comment: review.structure?.comment || fallback.structure.comment
      },
      logic: {
        score: clampScore(review.logic?.score),
        comment: review.logic?.comment || fallback.logic.comment
      },
      originality: {
        score: clampScore(review.originality?.score),
        comment: review.originality?.comment || fallback.originality.comment
      },
      style: {
        score: clampScore(review.style?.score),
        comment: review.style?.comment || fallback.style.comment
      },
      relevance: {
        score: clampScore(review.relevance?.score),
        comment: review.relevance?.comment || fallback.relevance.comment
      },
      overallScore: clampScore(review.overallScore),
      summary: review.summary || fallback.summary,
      recommendations: Array.isArray(review.recommendations)
        ? review.recommendations.filter(r => r && typeof r === 'string')
        : []
    };

    return { fileName, ...normalizedReview };
  } catch (error) {
    console.error("Review error:", error);
    // Show clear message when API is not configured
    if (error.message === "API_KEY_MISSING" || error.message === "API_KEY_INVALID") {
      return { fileName, ...apiErrorFallback };
    }
    return { fileName, ...fallback };
  }
};
