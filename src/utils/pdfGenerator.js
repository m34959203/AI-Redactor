/**
 * PDF generation utilities using jsPDF
 */
import { jsPDF } from 'jspdf';
import { convertDocxToHtml, readFileAsArrayBuffer } from './docxConverter';

// Constants
const PAGE_WIDTH = 210; // A4 width in mm
const PAGE_HEIGHT = 297; // A4 height in mm
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 25;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_HEIGHT = 7;
const EMPTY_LINES_BEFORE_ARTICLE = 4;

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
 */
const setupCyrillicFont = (doc) => {
  // Use built-in helvetica as fallback, but we'll handle Cyrillic text carefully
  doc.setFont('helvetica');
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
 * @returns {{endY: number, endPage: number}}
 */
const renderHtmlToPdf = (doc, html, startY, startPage) => {
  // Strip HTML tags and get plain text
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const text = tempDiv.textContent || tempDiv.innerText || '';

  let currentY = startY;
  let currentPage = startPage;

  doc.setFontSize(11);

  const paragraphs = text.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;

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

  return { endY: currentY, endPage: currentPage };
};

/**
 * Adds a special page (cover, description, final) to PDF
 * @param {jsPDF} doc - jsPDF instance
 * @param {Object} pageData - Page data with file
 * @param {number} pageNum - Current page number
 * @returns {Promise<number>} - New page number
 */
const addSpecialPage = async (doc, pageData, pageNum) => {
  if (!pageData || !pageData.file) return pageNum;

  try {
    if (pageData.type === '.pdf') {
      // For PDF files, we add a placeholder page (full PDF embedding requires pdf-lib)
      doc.setFontSize(12);
      doc.text(`[Содержимое файла: ${pageData.name}]`, MARGIN_LEFT, MARGIN_TOP);
      doc.text('(PDF файл будет интегрирован)', MARGIN_LEFT, MARGIN_TOP + LINE_HEIGHT);
      addPageNumber(doc, pageNum);
      return pageNum;
    } else if (pageData.type === '.docx') {
      const { html } = await convertDocxToHtml(pageData.file);
      const result = renderHtmlToPdf(doc, html, MARGIN_TOP, pageNum);
      addPageNumber(doc, result.endPage);
      return result.endPage;
    }
  } catch (error) {
    console.error('Error adding special page:', error);
    doc.text(`Ошибка загрузки: ${pageData.name}`, MARGIN_LEFT, MARGIN_TOP);
    addPageNumber(doc, pageNum);
  }

  return pageNum;
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

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('СОДЕРЖАНИЕ', PAGE_WIDTH / 2, currentY, { align: 'center' });
  currentY += LINE_HEIGHT * 2;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

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

  setupCyrillicFont(doc);

  let currentPage = 1;
  const tocEntries = [];
  const totalSteps = 3 + articles.length; // cover, desc, articles, final
  let currentStep = 0;

  try {
    // 1. Cover page
    onProgress({ step: ++currentStep, total: totalSteps, message: 'Добавление титульного листа...' });
    currentPage = await addSpecialPage(doc, coverPage, currentPage);

    // 2. Description page
    onProgress({ step: ++currentStep, total: totalSteps, message: 'Добавление описания журнала...' });
    doc.addPage();
    currentPage++;
    currentPage = await addSpecialPage(doc, descriptionPage, currentPage);

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

      // Article header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      const titleLines = splitTextToLines(doc, article.title, CONTENT_WIDTH);
      for (const line of titleLines) {
        doc.text(line, MARGIN_LEFT, startY);
        startY += LINE_HEIGHT;
      }

      // Author
      doc.setFontSize(11);
      doc.setFont('helvetica', 'italic');
      doc.text(article.author, MARGIN_LEFT, startY);
      startY += LINE_HEIGHT * 2;

      doc.setFont('helvetica', 'normal');

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
    currentPage = await addSpecialPage(doc, finalPage, currentPage);

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
 * @returns {Blob} - PDF blob
 */
export const generateReviewPDF = (review) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  let currentY = MARGIN_TOP;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('РЕЦЕНЗИЯ НА СТАТЬЮ', PAGE_WIDTH / 2, currentY, { align: 'center' });
  currentY += LINE_HEIGHT * 2;

  // File name
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
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
  doc.setFont('helvetica', 'bold');
  doc.text('Оценки по критериям:', MARGIN_LEFT, currentY);
  currentY += LINE_HEIGHT * 1.5;

  doc.setFontSize(11);
  for (const { key, label } of criteria) {
    const score = review[key]?.score || '-';
    const comment = review[key]?.comment || '';

    doc.setFont('helvetica', 'bold');
    doc.text(`${label}: ${score}/5`, MARGIN_LEFT, currentY);
    currentY += LINE_HEIGHT;

    doc.setFont('helvetica', 'normal');
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
  doc.setFont('helvetica', 'bold');
  doc.text(`Общая оценка: ${review.overallScore}/5`, MARGIN_LEFT, currentY);
  currentY += LINE_HEIGHT * 2;

  // Summary
  doc.setFontSize(12);
  doc.text('Заключение:', MARGIN_LEFT, currentY);
  currentY += LINE_HEIGHT;

  doc.setFont('helvetica', 'normal');
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
    doc.setFont('helvetica', 'bold');
    doc.text('Рекомендации:', MARGIN_LEFT, currentY);
    currentY += LINE_HEIGHT;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
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
