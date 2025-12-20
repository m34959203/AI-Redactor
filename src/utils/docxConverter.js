/**
 * DOCX to HTML converter using mammoth.js
 */
import mammoth from 'mammoth';

/**
 * Converts a DOCX file to HTML with images embedded as base64
 * @param {File} file - DOCX file to convert
 * @returns {Promise<{html: string, messages: Array, images: Array}>}
 */
export const convertDocxToHtml = async (file) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const images = [];

    // Custom image converter that embeds images as base64
    const convertImage = mammoth.images.imgElement(function(image) {
      return image.read("base64").then(function(imageBuffer) {
        const dataUri = `data:${image.contentType};base64,${imageBuffer}`;
        images.push({
          contentType: image.contentType,
          dataUri: dataUri
        });
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

    return {
      html: result.value,
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
