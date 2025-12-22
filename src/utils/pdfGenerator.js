/**
 * PDF generation utilities using jsPDF
 * Supports both client-side (jsPDF) and server-side (LibreOffice) generation
 */
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { convertDocxToHtml, readFileAsArrayBuffer } from './docxConverter';
import { registerCyrillicFont, getFontName, preloadFonts } from './fontLoader';
import { checkServerHealth, generateJournalPdf } from './apiService';
import { groupArticlesBySection, SECTION_ORDER } from './languageDetection';

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
 * Adds page number and journal footer to the current page
 * Footer format alternates between odd and even pages (all centered):
 * - Odd pages: "Вестник Жезказганского Университета имени О.А. Байконурова | page_number"
 * - Even pages: "page_number | Вестник Жезказганского Университета имени О.А. Байконурова"
 * @param {jsPDF} doc - jsPDF instance
 * @param {number} pageNum - Page number
 */
const addPageNumber = (doc, pageNum) => {
  const journalTitle = 'Вестник Жезказганского Университета имени О.А. Байконурова';
  const isOddPage = pageNum % 2 === 1;
  const footerY = PAGE_HEIGHT - 10;
  const lineY = PAGE_HEIGHT - 15;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Draw horizontal line above footer
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_LEFT, lineY, PAGE_WIDTH - MARGIN_RIGHT, lineY);

  if (isOddPage) {
    // Odd pages: "Journal Title | page_number" (centered)
    const footerText = `${journalTitle} | ${pageNum}`;
    doc.text(footerText, PAGE_WIDTH / 2, footerY, { align: 'center' });
  } else {
    // Even pages: "page_number | Journal Title" (centered)
    const footerText = `${pageNum} | ${journalTitle}`;
    doc.text(footerText, PAGE_WIDTH / 2, footerY, { align: 'center' });
  }
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
      } else if (node.tagName === 'TABLE') {
        // Handle tables
        hasContent = true;
        const rows = node.querySelectorAll('tr');
        if (rows.length === 0) return;

        // Calculate column widths based on number of columns in first row
        const firstRow = rows[0];
        const colCount = firstRow.querySelectorAll('td, th').length || 1;
        const colWidth = CONTENT_WIDTH / colCount;
        const cellPadding = 2;
        const rowHeight = LINE_HEIGHT * 1.5;

        // Check if table fits on current page, otherwise start new page
        const estimatedTableHeight = rows.length * rowHeight;
        if (currentY + Math.min(estimatedTableHeight, 50) > PAGE_HEIGHT - MARGIN_BOTTOM) {
          addPageNumber(doc, currentPage);
          doc.addPage();
          currentPage++;
          currentY = MARGIN_TOP;
        }

        doc.setFontSize(10); // Smaller font for tables
        const tableStartY = currentY;

        rows.forEach((row, rowIndex) => {
          const cells = row.querySelectorAll('td, th');
          const isHeader = row.querySelectorAll('th').length > 0;

          // Check if we need a new page for this row
          if (currentY + rowHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
            addPageNumber(doc, currentPage);
            doc.addPage();
            currentPage++;
            currentY = MARGIN_TOP;
          }

          // Draw row background for header
          if (isHeader) {
            doc.setFillColor(240, 240, 240);
            doc.rect(MARGIN_LEFT, currentY - 1, CONTENT_WIDTH, rowHeight, 'F');
            doc.setFont(fontName, 'bold');
          } else {
            doc.setFont(fontName, 'normal');
          }

          // Draw cells
          cells.forEach((cell, cellIndex) => {
            const cellX = MARGIN_LEFT + (cellIndex * colWidth);
            const cellText = cell.textContent.trim();

            // Draw cell border
            doc.setDrawColor(180, 180, 180);
            doc.rect(cellX, currentY - 1, colWidth, rowHeight);

            // Draw cell text (truncate if too long)
            if (cellText) {
              const maxTextWidth = colWidth - (cellPadding * 2);
              let displayText = cellText;
              while (doc.getTextWidth(displayText) > maxTextWidth && displayText.length > 3) {
                displayText = displayText.slice(0, -4) + '...';
              }
              doc.text(displayText, cellX + cellPadding, currentY + LINE_HEIGHT * 0.8);
            }
          });

          currentY += rowHeight;
        });

        doc.setFontSize(FONT_SIZE);
        doc.setFont(fontName, 'normal');
        currentY += LINE_HEIGHT; // Space after table
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
 * Renders HTML content as image to preserve original Word formatting
 * @param {jsPDF} doc - jsPDF instance
 * @param {string} html - HTML content from DOCX
 * @param {number} startY - Starting Y position
 * @param {number} startPage - Starting page number
 * @returns {Promise<{endY: number, endPage: number, hasContent: boolean}>}
 */
const renderHtmlAsImage = async (doc, html, startY, startPage) => {
  let currentY = startY;
  let currentPage = startPage;
  let hasContent = false;

  if (!html || html.trim() === '') {
    return { endY: currentY, endPage: currentPage, hasContent };
  }

  // Create a hidden container for rendering
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    width: 160mm;
    padding: 0;
    margin: 0;
    background: white;
    font-family: 'PT Serif', 'Times New Roman', 'Liberation Serif', 'Noto Serif', Times, serif;
    font-size: 12pt;
    line-height: 1.5;
    color: black;
  `;

  // Add styles for proper rendering with @font-face for Times New Roman alternative
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap');

    .docx-content * {
      max-width: 100%;
      box-sizing: border-box;
    }
    .docx-content p {
      margin: 0 0 0.5em 0;
      text-align: justify;
      text-indent: 1.25cm;
    }
    .docx-content p:first-child {
      text-indent: 0;
    }
    .docx-content img {
      max-width: 100%;
      height: auto;
    }
    .docx-content img:not(.float-left):not(.float-right) {
      display: block;
      margin: 1em auto;
    }
    .docx-content img.float-left {
      float: left;
      margin: 0 1em 0.5em 0;
      max-width: 45%;
    }
    .docx-content img.float-right {
      float: right;
      margin: 0 0 0.5em 1em;
      max-width: 45%;
    }
    .docx-content p:has(img.float-left),
    .docx-content p:has(img.float-right) {
      overflow: hidden;
    }
    .docx-content::after {
      content: "";
      display: table;
      clear: both;
    }
    .docx-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0;
      font-size: 10pt;
    }
    .docx-content table, .docx-content th, .docx-content td {
      border: 1px solid #333;
    }
    .docx-content th, .docx-content td {
      padding: 4px 8px;
      text-align: left;
    }
    .docx-content th {
      background-color: #f0f0f0;
      font-weight: bold;
    }
    .docx-content h1, .docx-content h2, .docx-content h3 {
      margin: 1em 0 0.5em 0;
      font-weight: bold;
    }
    .docx-content h1 { font-size: 16pt; }
    .docx-content h2 { font-size: 14pt; }
    .docx-content h3 { font-size: 13pt; }
    .docx-content strong, .docx-content b { font-weight: bold; }
    .docx-content em, .docx-content i { font-style: italic; }
    .docx-content u { text-decoration: underline; }
    /* Author info styling - typically italic text near photo */
    .docx-content p > em:only-child,
    .docx-content p > i:only-child {
      display: block;
    }
    .docx-content ul, .docx-content ol {
      margin: 0.5em 0;
      padding-left: 2em;
    }
    .docx-content li {
      margin: 0.25em 0;
    }
    .docx-content p,
    .docx-content li,
    .docx-content h1,
    .docx-content h2,
    .docx-content h3 {
      orphans: 3;
      widows: 3;
      page-break-inside: avoid;
    }
  `;

  container.appendChild(styleElement);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'docx-content';
  contentDiv.innerHTML = html;
  container.appendChild(contentDiv);

  document.body.appendChild(container);

  try {
    // Wait for images to load
    const images = container.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    // Wait for fonts to load (PT Serif from Google Fonts)
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    // Additional small delay to ensure fonts are applied
    await new Promise(resolve => setTimeout(resolve, 100));

    // Render to canvas
    const canvas = await html2canvas(container, {
      scale: 2, // Higher quality
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    hasContent = true;

    // Calculate dimensions
    const imgWidth = CONTENT_WIDTH;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Line height in pixels (12pt * 1.5 line-height * scale 2 = ~36px)
    const lineHeightPx = 36;
    // Convert to mm for PDF - correct formula: proportional to height ratio
    const lineHeightMm = (lineHeightPx / canvas.height) * imgHeight;

    // Split into pages if content is too tall
    let remainingHeight = imgHeight;
    let sourceY = 0;

    // Minimum content height to draw (at least 3 lines)
    const minContentHeight = lineHeightMm * 3;

    while (remainingHeight > 0) {
      // Calculate available space on current page
      const availableHeight = PAGE_HEIGHT - MARGIN_BOTTOM - currentY;

      // Check if we need a new page - start new page if:
      // 1. Not at top of page AND
      // 2. Available space is less than minimum content height
      if (currentY > MARGIN_TOP && availableHeight < minContentHeight) {
        addPageNumber(doc, currentPage);
        doc.addPage();
        currentPage++;
        currentY = MARGIN_TOP;
      }

      const availableHeightAfterCheck = PAGE_HEIGHT - MARGIN_BOTTOM - currentY;
      let heightToDraw = Math.min(remainingHeight, availableHeightAfterCheck);

      // Round down to complete lines to avoid cutting text mid-line
      if (remainingHeight > heightToDraw && lineHeightMm > 0) {
        const numLines = Math.floor(heightToDraw / lineHeightMm);
        if (numLines > 0) {
          heightToDraw = numLines * lineHeightMm;
        }
      }

      // Calculate source rectangle from canvas - correct formula using height ratio
      const sourceHeight = (heightToDraw / imgHeight) * canvas.height;

      // Create a temporary canvas for this portion
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = Math.ceil(sourceHeight);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(
        canvas,
        0, sourceY, canvas.width, Math.ceil(sourceHeight),
        0, 0, canvas.width, Math.ceil(sourceHeight)
      );

      const partImgData = tempCanvas.toDataURL('image/jpeg', 0.95);
      doc.addImage(partImgData, 'JPEG', MARGIN_LEFT, currentY, imgWidth, heightToDraw);

      sourceY += Math.ceil(sourceHeight);
      remainingHeight -= heightToDraw;
      currentY += heightToDraw;

      if (remainingHeight > 0) {
        addPageNumber(doc, currentPage);
        doc.addPage();
        currentPage++;
        currentY = MARGIN_TOP;
      }
    }

  } catch (error) {
    console.error('Error rendering HTML as image:', error);
    // Fallback to text rendering
    const fontName = getFontName();
    doc.setFont(fontName, 'normal');
    doc.setFontSize(FONT_SIZE);
    doc.text('[Ошибка рендеринга контента]', MARGIN_LEFT, currentY);
    currentY += LINE_HEIGHT;
  } finally {
    document.body.removeChild(container);
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

      // Use html2canvas to preserve original Word formatting
      const result = await renderHtmlAsImage(doc, html, MARGIN_TOP, pageNum);

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
 * Generates table of contents with section headers
 * @param {jsPDF} doc - jsPDF instance
 * @param {Array} tocEntries - Array of {title, author, page, section}
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
  currentY += LINE_HEIGHT * 2.5;

  // Group entries by section
  const entriesBySection = {};
  tocEntries.forEach(entry => {
    const section = entry.section || SECTION_ORDER[0];
    if (!entriesBySection[section]) {
      entriesBySection[section] = [];
    }
    entriesBySection[section].push(entry);
  });

  let articleNumber = 1;

  // Iterate through sections in order
  for (const sectionName of SECTION_ORDER) {
    const sectionEntries = entriesBySection[sectionName];
    if (!sectionEntries || sectionEntries.length === 0) continue;

    // Check if we need a new page for section header
    if (currentY + LINE_HEIGHT * 4 > PAGE_HEIGHT - MARGIN_BOTTOM) {
      addPageNumber(doc, currentPage);
      doc.addPage();
      currentPage++;
      currentY = MARGIN_TOP;
    }

    // Section header
    doc.setFontSize(12);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(0, 51, 102); // Dark blue
    doc.text(sectionName, PAGE_WIDTH / 2, currentY, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    currentY += LINE_HEIGHT * 2;

    doc.setFontSize(11);
    doc.setFont(fontName, 'normal');

    // Articles in section
    for (const entry of sectionEntries) {
      if (currentY + LINE_HEIGHT * 3 > PAGE_HEIGHT - MARGIN_BOTTOM) {
        addPageNumber(doc, currentPage);
        doc.addPage();
        currentPage++;
        currentY = MARGIN_TOP;
      }

      // Article number and title
      const titleText = `${articleNumber}. ${entry.title}`;
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
      articleNumber++;
    }

    // Add space after section
    currentY += LINE_HEIGHT;
  }

  addPageNumber(doc, currentPage);
  return currentPage - startPage + 1;
};

/**
 * Adds section header page to PDF
 * @param {jsPDF} doc - jsPDF instance
 * @param {string} sectionName - Section name
 * @param {number} pageNum - Current page number
 * @returns {number} - Current Y position after header
 */
const addSectionHeader = (doc, sectionName, pageNum) => {
  const fontName = getFontName();

  // Section header - centered, bold, larger font
  doc.setFontSize(16);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(0, 51, 102); // Dark blue
  doc.text(sectionName, PAGE_WIDTH / 2, MARGIN_TOP, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Underline
  const textWidth = doc.getTextWidth(sectionName);
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.line(
    (PAGE_WIDTH - textWidth) / 2,
    MARGIN_TOP + 2,
    (PAGE_WIDTH + textWidth) / 2,
    MARGIN_TOP + 2
  );

  return MARGIN_TOP + LINE_HEIGHT * 3;
};

/**
 * Main PDF generation function with proper section grouping and TOC at the beginning
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
  const totalSteps = 4 + articles.length; // cover, desc, toc, articles, final
  let currentStep = 0;

  // Group articles by section
  const groupedArticles = groupArticlesBySection(articles);

  try {
    // 1. Cover page
    onProgress({ step: ++currentStep, total: totalSteps, message: 'Добавление титульного листа...' });
    currentPage = await addSpecialPage(doc, coverPage, currentPage, 'Титульный лист');

    // 2. Description page
    onProgress({ step: ++currentStep, total: totalSteps, message: 'Добавление описания журнала...' });
    doc.addPage();
    currentPage++;
    currentPage = await addSpecialPage(doc, descriptionPage, currentPage, 'Описание и редакция');

    // 3. First pass - calculate article positions for TOC
    // We need to estimate pages for TOC first, then adjust
    const tocPagesEstimate = Math.ceil(articles.length / 15) + 1; // Rough estimate
    let estimatedArticleStartPage = currentPage + tocPagesEstimate + 1;

    // Build TOC entries with estimated pages (will be corrected in second pass)
    let articleIndex = 0;
    let estimatedPage = estimatedArticleStartPage;

    for (const sectionName of SECTION_ORDER) {
      const sectionArticles = groupedArticles[sectionName];
      if (!sectionArticles || sectionArticles.length === 0) continue;

      // Section header takes half page estimate
      estimatedPage++;

      for (const article of sectionArticles) {
        tocEntries.push({
          title: article.title,
          author: article.author,
          section: article.section,
          page: estimatedPage // Will be updated
        });
        // Estimate 2 pages per article average
        estimatedPage += 2;
        articleIndex++;
      }
    }

    // 4. Generate Table of Contents (after description)
    onProgress({ step: ++currentStep, total: totalSteps, message: 'Генерация содержания...' });
    const tocStartPage = currentPage + 1;
    const tocPagesUsed = generateTableOfContents(doc, tocEntries, tocStartPage);
    currentPage = tocStartPage + tocPagesUsed - 1;

    // 5. Now add articles with section headers
    let lastSection = null;
    let globalArticleIndex = 0;

    for (const sectionName of SECTION_ORDER) {
      const sectionArticles = groupedArticles[sectionName];
      if (!sectionArticles || sectionArticles.length === 0) continue;

      // Add section header page
      doc.addPage();
      currentPage++;
      addPageNumber(doc, currentPage);
      const startY = addSectionHeader(doc, sectionName, currentPage);

      // Track if this is the first article in section
      let isFirstInSection = true;

      for (const article of sectionArticles) {
        onProgress({
          step: ++currentStep,
          total: totalSteps,
          message: `Обработка статьи ${globalArticleIndex + 1}/${articles.length}: ${article.title.substring(0, 30)}...`
        });

        // Start new page for each article (except first in section which continues on section page)
        const isFirst = isFirstInSection;
        if (!isFirst) {
          doc.addPage();
          currentPage++;
        }
        isFirstInSection = false;

        // Update TOC entry with actual page number
        if (tocEntries[globalArticleIndex]) {
          tocEntries[globalArticleIndex].page = currentPage;
        }

        // Add 4 empty lines before article
        // First article starts after section header, others start at top margin
        let articleY = isFirst ? startY : MARGIN_TOP;
        articleY = addEmptyLinesBeforeArticle(doc, articleY);

        const fontName = getFontName();

        // Article header
        doc.setFontSize(14);
        doc.setFont(fontName, 'bold');
        const titleLines = splitTextToLines(doc, article.title, CONTENT_WIDTH);
        for (const line of titleLines) {
          doc.text(line, MARGIN_LEFT, articleY);
          articleY += LINE_HEIGHT;
        }

        // Author
        doc.setFontSize(11);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(article.author, MARGIN_LEFT, articleY);
        doc.setTextColor(0, 0, 0);
        articleY += LINE_HEIGHT * 2;

        doc.setFont(fontName, 'normal');

        // Article content - render as image to preserve original Word formatting
        if (article.file) {
          try {
            const { html, images } = await convertDocxToHtml(article.file);
            console.log(`Article "${article.title}": HTML=${html?.length || 0} chars, images=${images?.length || 0}`);
            const result = await renderHtmlAsImage(doc, html, articleY, currentPage);
            currentPage = result.endPage;
            addPageNumber(doc, currentPage);
          } catch (error) {
            console.error('Error processing article:', error);
            doc.text('Ошибка загрузки содержимого статьи', MARGIN_LEFT, articleY);
            addPageNumber(doc, currentPage);
          }
        } else {
          addPageNumber(doc, currentPage);
        }

        globalArticleIndex++;
      }

      lastSection = sectionName;
    }

    // 6. Final page
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
 * Smart PDF generation - uses server (LibreOffice) for 100% Word formatting accuracy
 *
 * @param {Object} issue - Issue data
 * @param {Array} articles - Full articles array with files
 * @param {Object} coverPage - Cover page data
 * @param {Object} descriptionPage - Description page data
 * @param {Object} finalPage - Final page data
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{blob: Blob, method: 'server'}>}
 */
export const generatePDFSmart = async (issue, articles, coverPage, descriptionPage, finalPage, onProgress = () => {}) => {
  // Check if server is available
  onProgress({ step: 0, total: 5, message: 'Проверка сервера конвертации...' });

  const serverStatus = await checkServerHealth();

  if (!serverStatus.available) {
    throw new Error('Сервер конвертации недоступен. Запустите сервер: cd server && npm start');
  }

  if (!serverStatus.libreOffice) {
    throw new Error('LibreOffice не установлен на сервере. Установите: sudo apt install libreoffice');
  }

  // Use server-side generation with LibreOffice (100% formatting accuracy)
  console.log('Using server-side PDF generation (LibreOffice)');
  onProgress({ step: 1, total: 5, message: 'Конвертация через LibreOffice...' });

  const pdfBlob = await generateJournalPdf(
    { coverPage, descriptionPage, articles, finalPage },
    (progress) => onProgress({
      step: progress.step + 1,
      total: 5,
      message: progress.message
    })
  );

  return { blob: pdfBlob, method: 'server' };
};

/**
 * Check if server-side PDF generation is available
 * @returns {Promise<boolean>}
 */
export const isServerGenerationAvailable = async () => {
  const status = await checkServerHealth();
  return status.available && status.libreOffice;
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
