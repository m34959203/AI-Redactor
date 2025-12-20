/**
 * DOCX to HTML converter using mammoth.js with image positioning support
 */
import mammoth from 'mammoth';
import JSZip from 'jszip';

/**
 * Extracts image positioning information from DOCX XML
 * @param {ArrayBuffer} arrayBuffer - DOCX file as ArrayBuffer
 * @returns {Promise<Map<string, object>>} - Map of image ID to positioning info
 */
const extractImagePositioning = async (arrayBuffer) => {
  const positioningMap = new Map();

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file('word/document.xml')?.async('string');

    if (!documentXml) {
      return positioningMap;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(documentXml, 'application/xml');

    // Find all drawing elements (wp:anchor for floating images, wp:inline for inline)
    const namespaces = {
      'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'
    };

    // Process anchor elements (floating images with text wrapping)
    const anchors = doc.getElementsByTagNameNS(namespaces['wp'], 'anchor');
    for (const anchor of anchors) {
      const positioning = {
        type: 'anchor',
        float: 'left', // default
        wrap: 'square', // default
        width: null,
        height: null
      };

      // Get horizontal position
      const positionH = anchor.getElementsByTagNameNS(namespaces['wp'], 'positionH')[0];
      if (positionH) {
        const align = positionH.getElementsByTagNameNS(namespaces['wp'], 'align')[0];
        if (align) {
          const alignText = align.textContent?.toLowerCase();
          if (alignText === 'right') {
            positioning.float = 'right';
          } else if (alignText === 'center') {
            positioning.float = 'none';
            positioning.center = true;
          }
        }
        const posOffset = positionH.getElementsByTagNameNS(namespaces['wp'], 'posOffset')[0];
        if (posOffset) {
          // Position offset in EMUs (914400 EMUs = 1 inch)
          const offsetEmu = parseInt(posOffset.textContent) || 0;
          // If offset is more than half page width, assume right alignment
          if (offsetEmu > 3000000) { // ~3.3 inches from left
            positioning.float = 'right';
          }
        }
      }

      // Get wrap type
      const wrapSquare = anchor.getElementsByTagNameNS(namespaces['wp'], 'wrapSquare')[0];
      const wrapTight = anchor.getElementsByTagNameNS(namespaces['wp'], 'wrapTight')[0];
      const wrapNone = anchor.getElementsByTagNameNS(namespaces['wp'], 'wrapNone')[0];

      if (wrapSquare) {
        positioning.wrap = 'square';
        const wrapText = wrapSquare.getAttribute('wrapText');
        if (wrapText === 'right') {
          positioning.float = 'left';
        } else if (wrapText === 'left') {
          positioning.float = 'right';
        }
      } else if (wrapTight) {
        positioning.wrap = 'tight';
        const wrapText = wrapTight.getAttribute('wrapText');
        if (wrapText === 'right') {
          positioning.float = 'left';
        } else if (wrapText === 'left') {
          positioning.float = 'right';
        }
      } else if (wrapNone) {
        positioning.wrap = 'none';
      }

      // Get image dimensions
      const extent = anchor.getElementsByTagNameNS(namespaces['wp'], 'extent')[0];
      if (extent) {
        // Dimensions in EMUs (914400 EMUs = 1 inch)
        const cx = parseInt(extent.getAttribute('cx')) || 0;
        const cy = parseInt(extent.getAttribute('cy')) || 0;
        positioning.width = Math.round(cx / 914400 * 96); // Convert to pixels (96 DPI)
        positioning.height = Math.round(cy / 914400 * 96);
      }

      // Get image relationship ID
      const blip = anchor.getElementsByTagNameNS(namespaces['a'], 'blip')[0];
      if (blip) {
        const embedId = blip.getAttributeNS(namespaces['r'], 'embed');
        if (embedId) {
          positioningMap.set(embedId, positioning);
        }
      }
    }

    // Process inline elements (detect potential author photos by aspect ratio)
    const inlines = doc.getElementsByTagNameNS(namespaces['wp'], 'inline');
    for (const inline of inlines) {
      const positioning = {
        type: 'inline',
        float: 'none',
        wrap: 'none',
        width: null,
        height: null
      };

      // Get image dimensions
      const extent = inline.getElementsByTagNameNS(namespaces['wp'], 'extent')[0];
      if (extent) {
        const cx = parseInt(extent.getAttribute('cx')) || 0;
        const cy = parseInt(extent.getAttribute('cy')) || 0;
        positioning.width = Math.round(cx / 914400 * 96);
        positioning.height = Math.round(cy / 914400 * 96);

        // Heuristic: if image is portrait-oriented and smaller than page width,
        // it might be an author photo - suggest float left
        if (positioning.height > positioning.width && positioning.width < 300) {
          positioning.suggestFloat = 'left';
        }
      }

      const blip = inline.getElementsByTagNameNS(namespaces['a'], 'blip')[0];
      if (blip) {
        const embedId = blip.getAttributeNS(namespaces['r'], 'embed');
        if (embedId) {
          positioningMap.set(embedId, positioning);
        }
      }
    }

    console.log('Extracted image positioning:', positioningMap);
  } catch (error) {
    console.warn('Could not extract image positioning:', error);
  }

  return positioningMap;
};

/**
 * Applies positioning classes to images in HTML based on extracted positioning info
 * @param {string} html - HTML content from mammoth
 * @param {Array} imagePositioning - Array of positioning info for each image
 * @returns {string} - HTML with positioning classes applied to images
 */
const applyImagePositioning = (html, imagePositioning) => {
  if (!imagePositioning || imagePositioning.length === 0) {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const images = doc.querySelectorAll('img');

  images.forEach((img, index) => {
    const positioning = imagePositioning[index];
    if (!positioning) return;

    let positionClass = '';
    let styles = [];

    if (positioning.type === 'anchor' && positioning.wrap !== 'none') {
      positionClass = `float-${positioning.float}`;
    } else if (positioning.suggestFloat) {
      positionClass = `float-${positioning.suggestFloat}`;
    }

    if (positioning.width && positioning.height) {
      styles.push(`width: ${positioning.width}px`);
      styles.push(`height: ${positioning.height}px`);
    }

    if (positionClass) {
      img.classList.add(positionClass);
    }

    if (styles.length > 0) {
      const existingStyle = img.getAttribute('style') || '';
      img.setAttribute('style', existingStyle + styles.join('; ') + ';');
    }
  });

  // Return inner HTML of the wrapper div
  return doc.body.firstChild.innerHTML;
};

/**
 * Converts a DOCX file to HTML with images embedded as base64 and positioning preserved
 * @param {File} file - DOCX file to convert
 * @returns {Promise<{html: string, messages: Array, images: Array}>}
 */
export const convertDocxToHtml = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const images = [];
    const imagePositioning = [];

    // Extract image positioning from DOCX XML
    const positioningMap = await extractImagePositioning(arrayBuffer);
    const positioningEntries = Array.from(positioningMap.values());

    // Custom image converter that embeds images as base64
    let imageIndex = 0;
    const convertImage = mammoth.images.imgElement(function(image) {
      return image.read("base64").then(function(imageBuffer) {
        const dataUri = `data:${image.contentType};base64,${imageBuffer}`;

        // Get positioning info for this image
        const positioning = positioningEntries[imageIndex] || null;

        images.push({
          contentType: image.contentType,
          dataUri: dataUri,
          positioning: positioning
        });

        imagePositioning.push(positioning);
        imageIndex++;

        return {
          src: dataUri
        };
      });
    });

    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1.article-title",
          "p[style-name='Heading 1'] => h1",
          "p[style-name='Heading 2'] => h2",
          "p[style-name='Heading 3'] => h3",
          "b => strong",
          "i => em",
          "u => u"
        ],
        convertImage: convertImage
      }
    );

    // Apply positioning classes to images in post-processing
    const processedHtml = applyImagePositioning(result.value, imagePositioning);

    return {
      html: processedHtml,
      messages: result.messages,
      images: images
    };
  } catch (error) {
    console.error('DOCX conversion error:', error);
    throw new Error(`Ошибка конвертации файла ${file.name}: ${error.message}`);
  }
};

/**
 * Converts a DOCX file to plain text
 * @param {File} file - DOCX file to convert
 * @returns {Promise<string>}
 */
export const convertDocxToText = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error('DOCX text extraction error:', error);
    throw new Error(`Ошибка извлечения текста из ${file.name}: ${error.message}`);
  }
};

/**
 * Reads a PDF file and returns its data URL for embedding
 * @param {File} file - PDF file
 * @returns {Promise<string>} - Data URL of the PDF
 */
export const readPdfAsDataUrl = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Ошибка чтения PDF файла'));
    reader.readAsDataURL(file);
  });
};

/**
 * Reads a file as ArrayBuffer
 * @param {File} file - File to read
 * @returns {Promise<ArrayBuffer>}
 */
export const readFileAsArrayBuffer = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsArrayBuffer(file);
  });
};
