/**
 * Cyrillic font loader for jsPDF
 * Loads PT Serif font (Times New Roman-like) for academic journals
 */

// Font URLs from Google Fonts repository (PT Serif - Times-like, supports Cyrillic)
const FONT_URLS = {
  regular: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptserif/PT_Serif-Web-Regular.ttf',
  bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptserif/PT_Serif-Web-Bold.ttf',
  italic: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptserif/PT_Serif-Web-Italic.ttf',
};

// Fallback to PT Sans if PT Serif not available
const FALLBACK_URLS = {
  regular: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PT_Sans-Web-Regular.ttf',
  bold: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PT_Sans-Web-Bold.ttf',
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

  try {
    // Try PT Serif first (Times-like)
    let [regular, bold, italic] = await Promise.all([
      loadFontFromUrl(FONT_URLS.regular),
      loadFontFromUrl(FONT_URLS.bold),
      loadFontFromUrl(FONT_URLS.italic),
    ]);

    // Fallback to PT Sans if PT Serif failed
    if (!regular) {
      console.warn('PT Serif not available, trying PT Sans fallback...');
      [regular, bold] = await Promise.all([
        loadFontFromUrl(FALLBACK_URLS.regular),
        loadFontFromUrl(FALLBACK_URLS.bold),
      ]);
      fontName = 'PTSans';
    } else {
      fontName = 'PTSerif';
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
