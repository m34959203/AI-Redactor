/**
 * Cyrillic font loader for jsPDF
 * Loads PT Sans font from CDN and registers it with jsPDF
 */

// Font URLs (PT Sans - popular Russian font, supports Cyrillic)
const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/gh/nickmessing/jsPDF-CustomFonts-support@master/fonts/PTSans_normal.ttf',
  bold: 'https://cdn.jsdelivr.net/gh/nickmessing/jsPDF-CustomFonts-support@master/fonts/PTSans_bold.ttf',
};

// Cache for loaded fonts
let fontsLoaded = false;
let fontData = {
  regular: null,
  bold: null,
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
    console.error('Error loading font:', error);
    return null;
  }
};

/**
 * Preloads Cyrillic fonts (call this early in app lifecycle)
 */
export const preloadFonts = async () => {
  if (fontsLoaded) return true;

  try {
    const [regular, bold] = await Promise.all([
      loadFontFromUrl(FONT_URLS.regular),
      loadFontFromUrl(FONT_URLS.bold),
    ]);

    fontData.regular = regular;
    fontData.bold = bold;
    fontsLoaded = regular !== null;

    console.log('Cyrillic fonts loaded:', fontsLoaded);
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
    // Add font to virtual file system
    doc.addFileToVFS('PTSans-Regular.ttf', fontData.regular);
    doc.addFont('PTSans-Regular.ttf', 'PTSans', 'normal');

    if (fontData.bold) {
      doc.addFileToVFS('PTSans-Bold.ttf', fontData.bold);
      doc.addFont('PTSans-Bold.ttf', 'PTSans', 'bold');
    }

    // Set as default font
    doc.setFont('PTSans', 'normal');

    return true;
  } catch (error) {
    console.error('Error registering font:', error);
    return false;
  }
};

/**
 * Gets the font name to use (PTSans if available, helvetica fallback)
 * @returns {string} - Font name
 */
export const getFontName = () => {
  return fontsLoaded ? 'PTSans' : 'helvetica';
};

/**
 * Checks if Cyrillic fonts are loaded
 */
export const areFontsLoaded = () => fontsLoaded;
