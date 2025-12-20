/**
 * PDF generation utilities using jsPDF
 */
import { jsPDF } from 'jspdf';
import { convertDocxToHtml, readFileAsArrayBuffer } from './docxConverter';
import { registerCyrillicFont, getFontName, preloadFonts } from './fontLoader';

// Constants (based on "Вестник ЖезУ" journal requirements)
const PAGE_WIDTH = 210; // A4 width in mm
const PAGE_HEIGHT = 297; // A4 height in mm
const MARGIN_LEFT = 25; // 2.5 cm
const MARGIN_RIGHT = 25; // 2.5 cm
const MARGIN_TOP = 30; // 3 cm
const MARGIN_BOTTOM = 30; // 3 cm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_HEIGHT = 6; // For 12pt font with single spacing
const FONT_SIZE = 12; // Times New Roman 12pt as per requirements
const EMPTY_LINES_BEFORE_ARTICLE = 4;

// Preload fonts at module load
preloadFonts();

// Content dimensions for images
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

/**
 * Validates if all required pages are uploaded
 * @param {Object} coverPage - Cover page data
 * @param {Object} descriptionPage - Description page data
 * @param {Object} finalPage - Final page data
 * @returns {{valid: boolean, missingPages: string[]}}
 */
export const validatePdfRequirements = (coverPage, descriptionPage, finalPage) => {
  const missingPages = [];

  if (!coverPage) missingPages.push('Титульный лист');
  if (!descriptionPage) missingPages.push('Описание журнала и редакции');
  if (!finalPage) missingPages.push('Заключительная страница');

  return {
    valid: missingPages.length === 0,
    missingPages
  };
};

/**
 * Generates issue object for archive
 * @param {Array} articles - Articles array
 * @param {Object} coverPage - Cover page data
 * @param {Object} descriptionPage - Description page data
 * @param {Object} finalPage - Final page data
 * @returns {Object} - Issue object
 */
export const createIssue = (articles, coverPage, descriptionPage, finalPage) => {
  return {
    id: Date.now(),
    date: new Date().toLocaleDateString('ru-RU'),
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    articlesCount: articles.length,
    name: `Выпуск ${new Date().toLocaleDateString('ru-RU')}`,
    hasCover: !!coverPage,
    hasDescription: !!descriptionPage,
    hasFinal: !!finalPage,
    articles: articles.map(a => ({
      id: a.id,
      title: a.title,
      author: a.author
    })),
    pdfBlob: null // Will be set after generation
  };
};

/**
 * Adds Cyrillic font support to jsPDF
 * @param {jsPDF} doc - jsPDF instance
 * @returns {Promise<void>}
 */
const setupCyrillicFont = async (doc) => {
  const success = await registerCyrillicFont(doc);
  if (!success) {
    console.warn('Using fallback font (helvetica) - Cyrillic may not display correctly');
    doc.setFont('helvetica');
  }
};

/**
 * Splits text into lines that fit within the content width
 * @param {jsPDF} doc - jsPDF instance
 * @param {string} text - Text to split
 * @param {number} maxWidth - Maximum width in mm
 * @returns {string[]} - Array of lines
 */
const splitTextToLines = (doc, text, maxWidth) => {
  if (!text) return [];
  return doc.splitTextToSize(text, maxWidth);
};

/**
 * Adds page number to the current page
 * @param {jsPDF} doc - jsPDF instance
 * @param {number} pageNum - Page number
 */
const addPageNumber = (doc, pageNum) => {
  doc.setFontSize(10);
  doc.setTextColor(128, 128, 128);
  doc.text(
    String(pageNum),
    PAGE_WIDTH / 2,
    PAGE_HEIGHT - 10,
    { align: 'center' }
  );
  doc.setTextColor(0, 0, 0);
};

/**
 * Adds empty lines before article (4 lines as per requirements)
 * @param {jsPDF} doc - jsPDF instance
 * @param {number} currentY - Current Y position
 * @returns {number} - New Y position
 */
const addEmptyLinesBeforeArticle = (doc, currentY) => {
  const spaceNeeded = EMPTY_LINES_BEFORE_ARTICLE * LINE_HEIGHT;

  if (currentY + spaceNeeded > PAGE_HEIGHT - MARGIN_BOTTOM) {
    doc.addPage();
    return MARGIN_TOP;
  }

  return currentY + spaceNeeded;
};

/**
 * Renders HTML content to PDF (simplified version)
 * @param {jsPDF} doc - jsPDF instance
 * @param {string} html - HTML content
 * @param {number} startY - Starting Y position
 * @param {number} startPage - Starting page number
 * @returns {{endY: number, endPage: number, hasContent: boolean}}
 */
const renderHtmlToPdf = (doc, html, startY, startPage) => {
  // Strip HTML tags and get plain text
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const text = tempDiv.textContent || tempDiv.innerText || '';

  let currentY = startY;
  let currentPage = startPage;
  let hasContent = false;

  // Ensure font is set
  const fontName = getFontName();
  doc.setFont(fontName, 'normal');
  doc.setFontSize(FONT_SIZE);
  doc.setTextColor(0, 0, 0);

  const paragraphs = text.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;

    hasContent = true;
    const lines = splitTextToLines(doc, paragraph.trim(), CONTENT_WIDTH);

    for (const line of lines) {
      if (currentY + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
        addPageNumber(doc, currentPage);
        doc.addPage();
        currentPage++;
        currentY = MARGIN_TOP;
      }

      doc.text(line, MARGIN_LEFT, currentY);
      currentY += LINE_HEIGHT;
    }

    currentY += LINE_HEIGHT / 2; // Paragraph spacing
  }

  return { endY: currentY, endPage: currentPage, hasContent };
};

/**
 * Renders HTML content with images to PDF
 * @param {jsPDF} doc - jsPDF instance
 * @param {string} html - HTML content with embedded images
 * @param {number} startY - Starting Y position
 * @param {number} startPage - Starting page number
 * @returns {{endY: number, endPage: number, hasContent: boolean}}
 */
const renderHtmlWithImagesToPdf = (doc, html, startY, startPage) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  let currentY = startY;
  let currentPage = startPage;
  let hasContent = false;

  const fontName = getFontName();
  doc.setFont(fontName, 'normal');
  doc.setFontSize(FONT_SIZE);
  doc.setTextColor(0, 0, 0);

  // Process all child nodes (text and images)
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        hasContent = true;
        const lines = splitTextToLines(doc, text, CONTENT_WIDTH);
        for (const line of lines) {
          if (currentY + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
            addPageNumber(doc, currentPage);
            doc.addPage();
            currentPage++;
            currentY = MARGIN_TOP;
          }
          doc.text(line, MARGIN_LEFT, currentY);
          currentY += LINE_HEIGHT;
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src');
        if (src && src.startsWith('data:')) {
          hasContent = true;
          try {
            // Calculate image dimensions to fit within content area
            const img = new Image();
            img.src = src;

            // Default dimensions if we can't determine actual size
            let imgWidth = CONTENT_WIDTH;
            let imgHeight = CONTENT_HEIGHT;

            // Try to get actual dimensions from the data URI
            // For now, use full page width and proportional height
            const maxWidth = CONTENT_WIDTH;
            const maxHeight = CONTENT_HEIGHT - (currentY - MARGIN_TOP);

            // If image is too tall for remaining space, start new page
            if (maxHeight < 50) {
              addPageNumber(doc, currentPage);
              doc.addPage();
              currentPage++;
              currentY = MARGIN_TOP;
            }

            // Scale to fit content width, maintaining aspect ratio
            imgWidth = maxWidth;
            imgHeight = maxWidth * 0.75; // Default 4:3 aspect ratio

            // Ensure image doesn't exceed available height
            const availableHeight = PAGE_HEIGHT - MARGIN_BOTTOM - currentY;
            if (imgHeight > availableHeight) {
              imgHeight = availableHeight;
              imgWidth = imgHeight / 0.75;
            }

            // Determine image format from data URI
            let format = 'JPEG';
            if (src.includes('image/png')) {
              format = 'PNG';
            } else if (src.includes('image/gif')) {
              format = 'GIF';
            }

            // Add image to PDF
            doc.addImage(src, format, MARGIN_LEFT, currentY, imgWidth, imgHeight);
            currentY += imgHeight + LINE_HEIGHT;

          } catch (imgError) {
            console.error('Error adding image to PDF:', imgError);
            doc.text('[Ошибка загрузки изображения]', MARGIN_LEFT, currentY);
            currentY += LINE_HEIGHT;
          }
        }
      } else if (node.tagName === 'P' || node.tagName === 'DIV') {
        // Process paragraph children
        for (const child of node.childNodes) {
          processNode(child);
        }
        currentY += LINE_HEIGHT / 2; // Paragraph spacing
      } else if (node.tagName === 'H1' || node.tagName === 'H2' || node.tagName === 'H3') {
        // Handle headings with bold font
        doc.setFont(fontName, 'bold');
        const fontSize = node.tagName === 'H1' ? 16 : node.tagName === 'H2' ? 14 : 13;
        doc.setFontSize(fontSize);

        const text = node.textContent.trim();
        if (text) {
          hasContent = true;
          const lines = splitTextToLines(doc, text, CONTENT_WIDTH);
          for (const line of lines) {
            if (currentY + LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
              addPageNumber(doc, currentPage);
              doc.addPage();
              currentPage++;
              currentY = MARGIN_TOP;
            }
            doc.text(line, MARGIN_LEFT, currentY);
            currentY += LINE_HEIGHT * 1.2;
          }
        }

        doc.setFont(fontName, 'normal');
        doc.setFontSize(FONT_SIZE);
        currentY += LINE_HEIGHT / 2;
      } else {
        // Process other elements recursively
        for (const child of node.childNodes) {
          processNode(child);
        }
      }
    }
  };

  // Process all top-level children
  for (const child of tempDiv.childNodes) {
    processNode(child);
  }

  return { endY: currentY, endPage: currentPage, hasContent };
};

/**
 * Adds a special page (cover, description, final) to PDF
 * @param {jsPDF} doc - jsPDF instance
 * @param {Object} pageData - Page data with file
 * @param {number} pageNum - Current page number
 * @param {string} pageName - Name of the page type for error messages
 * @returns {Promise<number>} - New page number
 */
const addSpecialPage = async (doc, pageData, pageNum, pageName = 'страница') => {
  const fontName = getFontName();

  // Ensure font is set for this page
  doc.setFont(fontName, 'normal');
  doc.setFontSize(FONT_SIZE);
  doc.setTextColor(0, 0, 0);

  if (!pageData || !pageData.file) {
    console.warn(`Special page missing: ${pageName}`);
    doc.text(`[${pageName} не загружен]`, MARGIN_LEFT, MARGIN_TOP);
    addPageNumber(doc, pageNum);
    return pageNum;
  }

  const fileType = (pageData.type || '').toLowerCase();
  console.log(`Adding special page: ${pageName}, type: ${fileType}, file: ${pageData.name}`);

  try {
    if (fileType === '.pdf') {
      // For PDF files, we add a placeholder page (full PDF embedding requires pdf-lib)
      doc.setFont(fontName, 'bold');
      doc.setFontSize(14);
      doc.text(`[Содержимое из PDF: ${pageData.name}]`, MARGIN_LEFT, MARGIN_TOP);
      doc.setFont(fontName, 'normal');
      doc.setFontSize(11);
      doc.text('(PDF файлы рекомендуется загружать в формате .docx для полной интеграции)', MARGIN_LEFT, MARGIN_TOP + LINE_HEIGHT * 2);
      addPageNumber(doc, pageNum);
      return pageNum;
    } else if (fileType === '.docx' || fileType === '.doc') {
      const { html, images } = await convertDocxToHtml(pageData.file);

      console.log(`Converted ${pageName}: HTML length=${html?.length || 0}, images=${images?.length || 0}`);

      if ((!html || html.trim() === '') && (!images || images.length === 0)) {
        console.warn(`Empty content for ${pageName}: ${pageData.name}`);
        doc.text(`[Файл ${pageData.name} не содержит контента]`, MARGIN_LEFT, MARGIN_TOP);
        addPageNumber(doc, pageNum);
        return pageNum;
      }

      // Use image-aware renderer for special pages
      const result = renderHtmlWithImagesToPdf(doc, html, MARGIN_TOP, pageNum);

      if (!result.hasContent) {
        console.warn(`No rendered content for ${pageName}: ${pageData.name}`);
        doc.text(`[Не удалось извлечь контент из ${pageData.name}]`, MARGIN_LEFT, MARGIN_TOP);
      }

      addPageNumber(doc, result.endPage);
      return result.endPage;
    } else {
      // Unknown file type
      console.warn(`Unknown file type for ${pageName}: ${fileType}`);
      doc.text(`[Неподдерживаемый формат файла: ${pageData.name}]`, MARGIN_LEFT, MARGIN_TOP);
      doc.text('Поддерживаемые форматы: .docx, .pdf', MARGIN_LEFT, MARGIN_TOP + LINE_HEIGHT);
      addPageNumber(doc, pageNum);
      return pageNum;
    }
  } catch (error) {
    console.error(`Error adding special page ${pageName}:`, error);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(FONT_SIZE);
    doc.text(`Ошибка загрузки: ${pageData.name}`, MARGIN_LEFT, MARGIN_TOP);
    doc.text(`Причина: ${error.message}`, MARGIN_LEFT, MARGIN_TOP + LINE_HEIGHT);
    addPageNumber(doc, pageNum);
    return pageNum;
  }
};

/**
 * Generates table of contents
 * @param {jsPDF} doc - jsPDF instance
 * @param {Array} tocEntries - Array of {title, author, page}
 * @param {number} startPage - Page number for TOC
 * @returns {number} - Number of pages used for TOC
 */
const generateTableOfContents = (doc, tocEntries, startPage) => {
  doc.addPage();
  let currentY = MARGIN_TOP;
  let currentPage = startPage;
  const fontName = getFontName();

  // Title
  doc.setFontSize(16);
  doc.setFont(fontName, 'bold');
  doc.text('СОДЕРЖАНИЕ', PAGE_WIDTH / 2, currentY, { align: 'center' });
  currentY += LINE_HEIGHT * 2;

  doc.setFontSize(11);
  doc.setFont(fontName, 'normal');

  for (let i = 0; i < tocEntries.length; i++) {
    const entry = tocEntries[i];

    if (currentY + LINE_HEIGHT * 2 > PAGE_HEIGHT - MARGIN_BOTTOM) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      currentY = MARGIN_TOP;
    }

    // Article number and title
    const titleText = `${i + 1}. ${entry.title}`;
    const titleLines = splitTextToLines(doc, titleText, CONTENT_WIDTH - 20);

    for (const line of titleLines) {
      doc.text(line, MARGIN_LEFT, currentY);
      currentY += LINE_HEIGHT;
    }

    // Author and page number
    const authorText = `    ${entry.author}`;
    doc.setTextColor(100, 100, 100);
    doc.text(authorText, MARGIN_LEFT, currentY);

    // Page number on the right
    doc.text(String(entry.page), PAGE_WIDTH - MARGIN_RIGHT, currentY, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    currentY += LINE_HEIGHT * 1.5;
  }

  addPageNumber(doc, currentPage);
  return currentPage - startPage + 1;
};

/**
 * Main PDF generation function
 * @param {Object} issue - Issue data
 * @param {Array} articles - Full articles array with files
 * @param {Object} coverPage - Cover page data
 * @param {Object} descriptionPage - Description page data
 * @param {Object} finalPage - Final page data
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Blob>} - Generated PDF as Blob
 */
export const generatePDF = async (issue, articles, coverPage, descriptionPage, finalPage, onProgress = () => {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Setup Cyrillic font support
  onProgress({ step: 0, total: 0, message: 'Загрузка шрифтов...' });
  await setupCyrillicFont(doc);

  let currentPage = 1;
  const tocEntries = [];
  const totalSteps = 3 + articles.length; // cover, desc, articles, final
  let currentStep = 0;

  try {
    // 1. Cover page
    onProgress({ step: ++currentStep, total: totalSteps, message: 'Добавление титульного листа...' });
    currentPage = await addSpecialPage(doc, coverPage, currentPage, 'Титульный лист');

    // 2. Description page
    onProgress({ step: ++currentStep, total: totalSteps, message: 'Добавление описания журнала...' });
    doc.addPage();
    currentPage++;
    currentPage = await addSpecialPage(doc, descriptionPage, currentPage, 'Описание и редакция');

    // 3. Articles
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      onProgress({
        step: ++currentStep,
        total: totalSteps,
        message: `Обработка статьи ${i + 1}/${articles.length}: ${article.title.substring(0, 30)}...`
      });

      doc.addPage();
      currentPage++;

      // Add 4 empty lines before article (except first)
      let startY = MARGIN_TOP;
      if (i > 0) {
        startY = addEmptyLinesBeforeArticle(doc, MARGIN_TOP);
      }

      // Record page for TOC
      const articleStartPage = currentPage;

      const fontName = getFontName();

      // Article header
      doc.setFontSize(14);
      doc.setFont(fontName, 'bold');
      const titleLines = splitTextToLines(doc, article.title, CONTENT_WIDTH);
      for (const line of titleLines) {
        doc.text(line, MARGIN_LEFT, startY);
        startY += LINE_HEIGHT;
      }

      // Author
      doc.setFontSize(11);
      doc.setFont(fontName, 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(article.author, MARGIN_LEFT, startY);
      doc.setTextColor(0, 0, 0);
      startY += LINE_HEIGHT * 2;

      doc.setFont(fontName, 'normal');

      // Article content
      if (article.file) {
        try {
          const { html } = await convertDocxToHtml(article.file);
          const result = renderHtmlToPdf(doc, html, startY, currentPage);
          currentPage = result.endPage;
          addPageNumber(doc, currentPage);
        } catch (error) {
          console.error('Error processing article:', error);
          doc.text('Ошибка загрузки содержимого статьи', MARGIN_LEFT, startY);
          addPageNumber(doc, currentPage);
        }
      }

      tocEntries.push({
        title: article.title,
        author: article.author,
        page: articleStartPage
      });
    }

    // 4. Table of Contents (inserted after description, we need to note the page)
    const tocStartPage = currentPage + 1;
    generateTableOfContents(doc, tocEntries, tocStartPage);
    currentPage = tocStartPage;

    // 5. Final page
    onProgress({ step: totalSteps, total: totalSteps, message: 'Добавление заключительной страницы...' });
    doc.addPage();
    currentPage++;
    currentPage = await addSpecialPage(doc, finalPage, currentPage, 'Заключительная страница');

    // Generate blob
    const pdfBlob = doc.output('blob');

    onProgress({ step: totalSteps, total: totalSteps, message: 'PDF успешно создан!' });

    return pdfBlob;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`Ошибка генерации PDF: ${error.message}`);
  }
};

/**
 * Downloads a PDF blob as a file
 * @param {Blob} pdfBlob - PDF blob
 * @param {string} fileName - File name
 */
export const downloadPDF = (pdfBlob, fileName) => {
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || `journal_${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Generates PDF for a review report
 * @param {Object} review - Review data
 * @returns {Promise<Blob>} - PDF blob
 */
export const generateReviewPDF = async (review) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Setup Cyrillic font
  await setupCyrillicFont(doc);
  const fontName = getFontName();

  let currentY = MARGIN_TOP;

  // Title
  doc.setFontSize(18);
  doc.setFont(fontName, 'bold');
  doc.text('РЕЦЕНЗИЯ НА СТАТЬЮ', PAGE_WIDTH / 2, currentY, { align: 'center' });
  currentY += LINE_HEIGHT * 2;

  // File name
  doc.setFontSize(12);
  doc.setFont(fontName, 'normal');
  doc.text(`Файл: ${review.fileName}`, MARGIN_LEFT, currentY);
  currentY += LINE_HEIGHT;
  doc.text(`Дата: ${new Date().toLocaleDateString('ru-RU')}`, MARGIN_LEFT, currentY);
  currentY += LINE_HEIGHT * 2;

  // Scores
  const criteria = [
    { key: 'structure', label: 'Структура' },
    { key: 'logic', label: 'Логичность' },
    { key: 'originality', label: 'Оригинальность' },
    { key: 'style', label: 'Стиль' },
    { key: 'relevance', label: 'Актуальность' }
  ];

  doc.setFontSize(14);
  doc.setFont(fontName, 'bold');
  doc.text('Оценки по критериям:', MARGIN_LEFT, currentY);
  currentY += LINE_HEIGHT * 1.5;

  doc.setFontSize(11);
  for (const { key, label } of criteria) {
    const score = review[key]?.score || '-';
    const comment = review[key]?.comment || '';

    doc.setFont(fontName, 'bold');
    doc.text(`${label}: ${score}/5`, MARGIN_LEFT, currentY);
    currentY += LINE_HEIGHT;

    doc.setFont(fontName, 'normal');
    const commentLines = splitTextToLines(doc, comment, CONTENT_WIDTH - 10);
    for (const line of commentLines) {
      doc.text(`  ${line}`, MARGIN_LEFT, currentY);
      currentY += LINE_HEIGHT;
    }
    currentY += LINE_HEIGHT / 2;
  }

  // Overall score
  currentY += LINE_HEIGHT;
  doc.setFontSize(14);
  doc.setFont(fontName, 'bold');
  doc.text(`Общая оценка: ${review.overallScore}/5`, MARGIN_LEFT, currentY);
  currentY += LINE_HEIGHT * 2;

  // Summary
  doc.setFontSize(12);
  doc.text('Заключение:', MARGIN_LEFT, currentY);
  currentY += LINE_HEIGHT;

  doc.setFont(fontName, 'normal');
  doc.setFontSize(11);
  const summaryLines = splitTextToLines(doc, review.summary || '', CONTENT_WIDTH);
  for (const line of summaryLines) {
    doc.text(line, MARGIN_LEFT, currentY);
    currentY += LINE_HEIGHT;
  }

  // Recommendations
  if (review.recommendations && review.recommendations.length > 0) {
    currentY += LINE_HEIGHT;
    doc.setFontSize(12);
    doc.setFont(fontName, 'bold');
    doc.text('Рекомендации:', MARGIN_LEFT, currentY);
    currentY += LINE_HEIGHT;

    doc.setFontSize(11);
    doc.setFont(fontName, 'normal');
    review.recommendations.forEach((rec, idx) => {
      const recLines = splitTextToLines(doc, `${idx + 1}. ${rec}`, CONTENT_WIDTH - 5);
      for (const line of recLines) {
        if (currentY > PAGE_HEIGHT - MARGIN_BOTTOM) {
          doc.addPage();
          currentY = MARGIN_TOP;
        }
        doc.text(line, MARGIN_LEFT, currentY);
        currentY += LINE_HEIGHT;
      }
    });
  }

  return doc.output('blob');
};
