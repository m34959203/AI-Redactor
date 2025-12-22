/**
 * Cyrillic font loader for jsPDF
 * Uses Noto Serif (Times New Roman-like, supports full Cyrillic including Kazakh) for academic journals
 * Noto Serif has metrics similar to Times New Roman and full Cyrillic Extended support
 */

// Primary: Noto Serif from MuPDF repository (Times-like, supports Kazakh Cyrillic)
const FONT_URLS = {
  regular: 'https://raw.githubusercontent.com/ArtifexSoftware/mupdf/master/resources/fonts/noto/NotoSerif-Regular.ttf',
  bold: 'https://raw.githubusercontent.com/ArtifexSoftware/mupdf/master/resources/fonts/noto/NotoSerif-Bold.ttf',
  italic: 'https://raw.githubusercontent.com/ArtifexSoftware/mupdf/master/resources/fonts/noto/NotoSerif-Italic.ttf',
};

// Fallback to Noto Serif if primary not available
const FALLBACK_URLS = {
  regular: 'https://raw.githubusercontent.com/ArtifexSoftware/mupdf/master/resources/fonts/droid/DroidSerif-Regular.ttf',
  bold: 'https://raw.githubusercontent.com/ArtifexSoftware/mupdf/master/resources/fonts/droid/DroidSerif-Bold.ttf',
  italic: 'https://raw.githubusercontent.com/ArtifexSoftware/mupdf/master/resources/fonts/droid/DroidSerif-Italic.ttf',
};

// Load Noto Serif web font for html2canvas rendering (supports Kazakh Cyrillic)
export const loadWebFont = () => {
  // Add Google Fonts link for Noto Serif with Cyrillic Extended subset (supports Kazakh)
  if (!document.getElementById('noto-serif-font')) {
    const link = document.createElement('link');
    link.id = 'noto-serif-font';
    link.rel = 'stylesheet';
    // Noto Serif supports full Kazakh Cyrillic (Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, Һ, І)
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700&subset=cyrillic,cyrillic-ext&display=swap';
    document.head.appendChild(link);
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
    // Try Noto Serif first (supports Cyrillic well)
    let [regular, bold, italic] = await Promise.all([
      loadFontFromUrl(FONT_URLS.regular),
      loadFontFromUrl(FONT_URLS.bold),
      loadFontFromUrl(FONT_URLS.italic),
    ]);

    // Fallback to Droid Serif if Noto Serif failed
    if (!regular) {
      console.warn('Noto Serif not available, trying Droid Serif fallback...');
      [regular, bold, italic] = await Promise.all([
        loadFontFromUrl(FALLBACK_URLS.regular),
        loadFontFromUrl(FALLBACK_URLS.bold),
        loadFontFromUrl(FALLBACK_URLS.italic),
      ]);
      fontName = 'DroidSerif';
    } else {
      fontName = 'NotoSerif';
    }

    fontData.regular = regular;
    fontData.bold = bold;
    fontData.italic = italic;
    fontsLoaded = regular !== null;

    console.log('Cyrillic fonts loaded:', fontsLoaded, 'Font:', fontName);
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
