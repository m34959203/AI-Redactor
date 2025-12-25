/**
 * Cyrillic font loader for jsPDF
 * Uses Noto Serif (Times New Roman-like, supports full Cyrillic including Kazakh) for academic journals
 * Noto Serif has metrics similar to Times New Roman and full Cyrillic Extended support
 *
 * IMPORTANT: For Kazakh language support, the font must include Cyrillic Extended characters:
 * Ә, ә, Ғ, ғ, Қ, қ, Ң, ң, Ө, ө, Ұ, ұ, Ү, ү, Һ, һ, І, і
 */

// Primary: Noto Serif from official Noto Fonts repository via jsDelivr CDN (supports Kazakh Cyrillic)
// Using hinted TTF files which include all Cyrillic Extended glyphs (Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, Һ, І)
const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/hinted/ttf/NotoSerif-Regular.ttf',
  bold: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/hinted/ttf/NotoSerif-Bold.ttf',
  italic: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/hinted/ttf/NotoSerif-Italic.ttf',
};

// Fallback 1: Unhinted Noto Serif (smaller file size)
const FALLBACK_URLS = {
  regular: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/unhinted/ttf/NotoSerif-Regular.ttf',
  bold: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/unhinted/ttf/NotoSerif-Bold.ttf',
  italic: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSerif/unhinted/ttf/NotoSerif-Italic.ttf',
};

// Fallback 2: PT Astra Serif - Russian state standard font with full Cyrillic Extended support
// This font is specifically designed for government documents and supports all Kazakh characters
const FALLBACK_URLS_2 = {
  regular: 'https://cdn.jsdelivr.net/gh/nickshanks/Noto@master/hinted/NotoSerif-Regular.ttf',
  bold: 'https://cdn.jsdelivr.net/gh/nickshanks/Noto@master/hinted/NotoSerif-Bold.ttf',
  italic: 'https://cdn.jsdelivr.net/gh/nickshanks/Noto@master/hinted/NotoSerif-Italic.ttf',
};

// Load Noto Serif web font for html2canvas rendering (supports Kazakh Cyrillic)
export const loadWebFont = () => {
  // Add Google Fonts link for Noto Serif
  // Using explicit text parameter to force loading of Kazakh Extended Cyrillic characters
  if (!document.getElementById('noto-serif-font')) {
    const link = document.createElement('link');
    link.id = 'noto-serif-font';
    link.rel = 'stylesheet';
    // Noto Serif supports full Kazakh Cyrillic (Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, Һ, І)
    // Using text parameter to ensure these specific characters are included
    const kazakhChars = encodeURIComponent('ӘәҒғҚқҢңӨөҰұҮүҺһІі');
    link.href = `https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700&text=${kazakhChars}&display=swap`;
    document.head.appendChild(link);

    // Also add full Cyrillic subset as second font link
    const link2 = document.createElement('link');
    link2.id = 'noto-serif-font-cyrillic';
    link2.rel = 'stylesheet';
    link2.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap';
    document.head.appendChild(link2);
  }
};

// Cache for loaded fonts
let fontsLoaded = false;
let fontName = 'times'; // Default to times, will be set to PTSerif if loaded
let fontData = {
  regular: null,
  bold: null,
  italic: null,
};

/**
 * Converts ArrayBuffer to base64 string
 */
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Loads font from URL and returns base64 string
 */
const loadFontFromUrl = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load font: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return arrayBufferToBase64(arrayBuffer);
  } catch (error) {
    console.error('Error loading font from:', url, error);
    return null;
  }
};

/**
 * Preloads Cyrillic fonts (call this early in app lifecycle)
 */
export const preloadFonts = async () => {
  if (fontsLoaded) return true;

  // Load web font for html2canvas rendering (Noto Serif - supports Kazakh Cyrillic)
  loadWebFont();

  try {
    // Try full Noto Serif first (includes all Cyrillic Extended glyphs for Kazakh)
    console.log('Loading full Noto Serif fonts with Kazakh support...');
    let [regular, bold, italic] = await Promise.all([
      loadFontFromUrl(FONT_URLS.regular),
      loadFontFromUrl(FONT_URLS.bold),
      loadFontFromUrl(FONT_URLS.italic),
    ]);

    // Fallback 1: Hinted Noto Serif
    if (!regular) {
      console.warn('Full Noto Serif not available, trying hinted fallback...');
      [regular, bold, italic] = await Promise.all([
        loadFontFromUrl(FALLBACK_URLS.regular),
        loadFontFromUrl(FALLBACK_URLS.bold),
        loadFontFromUrl(FALLBACK_URLS.italic),
      ]);
    }

    // Fallback 2: Unhinted Noto Serif
    if (!regular) {
      console.warn('Hinted Noto Serif not available, trying unhinted fallback...');
      [regular, bold, italic] = await Promise.all([
        loadFontFromUrl(FALLBACK_URLS_2.regular),
        loadFontFromUrl(FALLBACK_URLS_2.bold),
        loadFontFromUrl(FALLBACK_URLS_2.italic),
      ]);
    }

    fontName = 'NotoSerif';
    fontData.regular = regular;
    fontData.bold = bold;
    fontData.italic = italic;
    fontsLoaded = regular !== null;

    console.log('Cyrillic fonts loaded:', fontsLoaded, 'Font:', fontName);
    if (fontsLoaded) {
      console.log('Kazakh characters (Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, І) should now be supported');
    }
    return fontsLoaded;
  } catch (error) {
    console.error('Failed to preload fonts:', error);
    return false;
  }
};

/**
 * Registers Cyrillic font with jsPDF instance
 * @param {jsPDF} doc - jsPDF instance
 * @returns {boolean} - Whether font was successfully registered
 */
export const registerCyrillicFont = async (doc) => {
  // Load fonts if not already loaded
  if (!fontsLoaded) {
    await preloadFonts();
  }

  if (!fontData.regular) {
    console.warn('Cyrillic font not available, using fallback');
    return false;
  }

  try {
    // Add regular font
    doc.addFileToVFS(`${fontName}-Regular.ttf`, fontData.regular);
    doc.addFont(`${fontName}-Regular.ttf`, fontName, 'normal');

    // Add bold font
    if (fontData.bold) {
      doc.addFileToVFS(`${fontName}-Bold.ttf`, fontData.bold);
      doc.addFont(`${fontName}-Bold.ttf`, fontName, 'bold');
    }

    // Add italic font (for PT Serif)
    if (fontData.italic) {
      doc.addFileToVFS(`${fontName}-Italic.ttf`, fontData.italic);
      doc.addFont(`${fontName}-Italic.ttf`, fontName, 'italic');
    }

    // Set as default font
    doc.setFont(fontName, 'normal');

    return true;
  } catch (error) {
    console.error('Error registering font:', error);
    return false;
  }
};

/**
 * Gets the font name to use (PTSerif/PTSans if available, times fallback)
 * @returns {string} - Font name
 */
export const getFontName = () => {
  return fontsLoaded ? fontName : 'times';
};

/**
 * Checks if Cyrillic fonts are loaded
 */
export const areFontsLoaded = () => fontsLoaded;
