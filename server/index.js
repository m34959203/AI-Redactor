/**
 * AI-Redactor Backend Server
 * Provides DOCX to PDF conversion using LibreOffice
 * Adds page numbering and Table of Contents using pdf-lib
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// Section order for Table of Contents
const SECTION_ORDER = [
  'ТЕХНИЧЕСКИЕ НАУКИ',
  'ПЕДАГОГИЧЕСКИЕ НАУКИ',
  'ЕСТЕСТВЕННЫЕ И ЭКОНОМИЧЕСКИЕ НАУКИ'
];

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Temporary directory for file processing
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure temp directory exists
await fs.mkdir(TEMP_DIR, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const sessionDir = path.join(TEMP_DIR, req.sessionId || uuidv4());
    await fs.mkdir(sessionDir, { recursive: true });
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    // Preserve original filename with unique prefix
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf'
    ];
    if (allowedTypes.includes(file.mimetype) ||
        file.originalname.endsWith('.docx') ||
        file.originalname.endsWith('.doc') ||
        file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx, .doc and .pdf files are allowed'));
    }
  }
});

// Session ID middleware
app.use((req, res, next) => {
  req.sessionId = req.headers['x-session-id'] || uuidv4();
  next();
});

/**
 * Check if LibreOffice is available
 */
async function checkLibreOffice() {
  try {
    await execAsync('libreoffice --version');
    return true;
  } catch {
    try {
      await execAsync('soffice --version');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Convert DOCX to PDF using LibreOffice
 * @param {string} inputPath - Path to input DOCX file
 * @param {string} outputDir - Directory for output PDF
 * @returns {Promise<string>} - Path to generated PDF
 */
async function convertDocxToPdf(inputPath, outputDir) {
  const libreOfficeCmd = process.platform === 'win32' ? 'soffice' : 'libreoffice';

  const command = `${libreOfficeCmd} --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;

  console.log(`Converting: ${inputPath}`);
  console.log(`Command: ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 60000 });
    console.log('LibreOffice output:', stdout);
    if (stderr) console.log('LibreOffice stderr:', stderr);

    // Get output PDF path
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const pdfPath = path.join(outputDir, `${baseName}.pdf`);

    // Verify PDF was created
    await fs.access(pdfPath);
    return pdfPath;
  } catch (error) {
    console.error('LibreOffice conversion error:', error);
    throw new Error(`Conversion failed: ${error.message}`);
  }
}

/**
 * Add page numbers to a PDF using pdf-lib
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {number} startPage - Start numbering from this page (1-indexed, skip cover)
 * @returns {Promise<Buffer>} - PDF buffer with page numbers
 */
async function addPageNumbers(pdfBuffer, startPage = 2) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const pages = pdfDoc.getPages();

    for (let i = startPage - 1; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const pageNum = i + 1;

      // Add page number at bottom center
      const text = String(pageNum);
      const textWidth = font.widthOfTextAtSize(text, 10);

      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: 20,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
    }

    return Buffer.from(await pdfDoc.save());
  } catch (error) {
    console.error('Error adding page numbers:', error);
    return pdfBuffer; // Return original if fails
  }
}

/**
 * Load Cyrillic font for PDF generation
 * Tries system fonts first, then falls back to embedded font
 * @returns {Promise<Buffer|null>} - Font buffer or null if not found
 */
async function loadCyrillicFont() {
  // Common paths for DejaVu fonts on Linux
  const fontPaths = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    // macOS paths
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial.ttf'
  ];

  for (const fontPath of fontPaths) {
    try {
      const fontBuffer = await fs.readFile(fontPath);
      console.log(`Loaded Cyrillic font: ${fontPath}`);
      return fontBuffer;
    } catch {
      // Try next font
    }
  }

  console.warn('No Cyrillic font found, Table of Contents will use Latin fallback');
  return null;
}

/**
 * Generate Table of Contents PDF page
 * @param {Array} articles - Array of {title, author, section, pageNumber}
 * @param {number} tocStartPage - Page number where TOC starts
 * @returns {Promise<Buffer>} - PDF buffer with TOC
 */
async function generateTableOfContentsPdf(articles, tocStartPage) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Page dimensions (A4)
  const pageWidth = 595.28; // 210mm in points
  const pageHeight = 841.89; // 297mm in points
  const marginLeft = 70.87; // 25mm
  const marginRight = 70.87; // 25mm
  const marginTop = 85.04; // 30mm
  const marginBottom = 85.04; // 30mm
  const contentWidth = pageWidth - marginLeft - marginRight;
  const lineHeight = 17; // ~6mm

  // Try to load Cyrillic font
  const fontBuffer = await loadCyrillicFont();
  let font, fontBold;

  if (fontBuffer) {
    try {
      font = await pdfDoc.embedFont(fontBuffer);
      fontBold = font; // DejaVu Sans doesn't have separate bold, use same
    } catch (err) {
      console.warn('Failed to embed Cyrillic font:', err.message);
      font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    }
  } else {
    font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  }

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - marginTop;
  let currentPageNum = tocStartPage;

  // Title "СОДЕРЖАНИЕ"
  const titleText = 'СОДЕРЖАНИЕ';
  const titleSize = 16;
  try {
    const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
    page.drawText(titleText, {
      x: (pageWidth - titleWidth) / 2,
      y: currentY,
      size: titleSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  } catch {
    // Fallback for non-Cyrillic font
    const fallbackTitle = 'TABLE OF CONTENTS';
    const titleWidth = fontBold.widthOfTextAtSize(fallbackTitle, titleSize);
    page.drawText(fallbackTitle, {
      x: (pageWidth - titleWidth) / 2,
      y: currentY,
      size: titleSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }
  currentY -= lineHeight * 2.5;

  // Group articles by section
  const entriesBySection = {};
  articles.forEach(article => {
    const section = article.section || SECTION_ORDER[0];
    if (!entriesBySection[section]) {
      entriesBySection[section] = [];
    }
    entriesBySection[section].push(article);
  });

  let articleNumber = 1;

  // Iterate through sections in order
  for (const sectionName of SECTION_ORDER) {
    const sectionEntries = entriesBySection[sectionName];
    if (!sectionEntries || sectionEntries.length === 0) continue;

    // Check if we need a new page for section header
    if (currentY - lineHeight * 4 < marginBottom) {
      // Add page number to current page
      const pageNumText = String(currentPageNum);
      const pageNumWidth = font.widthOfTextAtSize(pageNumText, 10);
      page.drawText(pageNumText, {
        x: (pageWidth - pageNumWidth) / 2,
        y: 20,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page = pdfDoc.addPage([pageWidth, pageHeight]);
      currentPageNum++;
      currentY = pageHeight - marginTop;
    }

    // Section header (dark blue, centered)
    try {
      const sectionWidth = fontBold.widthOfTextAtSize(sectionName, 12);
      page.drawText(sectionName, {
        x: (pageWidth - sectionWidth) / 2,
        y: currentY,
        size: 12,
        font: fontBold,
        color: rgb(0, 0.2, 0.4), // Dark blue
      });
    } catch {
      // Section name might fail with non-Cyrillic font, skip
    }
    currentY -= lineHeight * 2;

    // Articles in section
    for (const entry of sectionEntries) {
      if (currentY - lineHeight * 3 < marginBottom) {
        // Add page number to current page
        const pageNumText = String(currentPageNum);
        const pageNumWidth = font.widthOfTextAtSize(pageNumText, 10);
        page.drawText(pageNumText, {
          x: (pageWidth - pageNumWidth) / 2,
          y: 20,
          size: 10,
          font: font,
          color: rgb(0, 0, 0),
        });

        page = pdfDoc.addPage([pageWidth, pageHeight]);
        currentPageNum++;
        currentY = pageHeight - marginTop;
      }

      // Article number and title
      const titleText = `${articleNumber}. ${entry.title || 'Без названия'}`;
      try {
        // Truncate title if too long
        let displayTitle = titleText;
        const maxTitleWidth = contentWidth - 30;
        while (font.widthOfTextAtSize(displayTitle, 11) > maxTitleWidth && displayTitle.length > 20) {
          displayTitle = displayTitle.slice(0, -4) + '...';
        }

        page.drawText(displayTitle, {
          x: marginLeft,
          y: currentY,
          size: 11,
          font: font,
          color: rgb(0, 0, 0),
        });
      } catch {
        // Skip if text rendering fails
      }
      currentY -= lineHeight;

      // Author (gray, indented) and page number
      const authorText = `    ${entry.author || 'Автор не указан'}`;
      try {
        page.drawText(authorText, {
          x: marginLeft,
          y: currentY,
          size: 11,
          font: font,
          color: rgb(0.4, 0.4, 0.4),
        });

        // Page number on the right
        const pageText = String(entry.pageNumber || '?');
        const pageTextWidth = font.widthOfTextAtSize(pageText, 11);
        page.drawText(pageText, {
          x: pageWidth - marginRight - pageTextWidth,
          y: currentY,
          size: 11,
          font: font,
          color: rgb(0, 0, 0),
        });
      } catch {
        // Skip if text rendering fails
      }

      currentY -= lineHeight * 1.5;
      articleNumber++;
    }

    // Add space after section
    currentY -= lineHeight;
  }

  // Add page number to last page
  const pageNumText = String(currentPageNum);
  const pageNumWidth = font.widthOfTextAtSize(pageNumText, 10);
  page.drawText(pageNumText, {
    x: (pageWidth - pageNumWidth) / 2,
    y: 20,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
  });

  return Buffer.from(await pdfDoc.save());
}

/**
 * Merge multiple PDF files using pdf-lib (no external tools needed)
 * Also adds page numbering
 * @param {string[]} pdfPaths - Array of PDF file paths
 * @param {string} outputPath - Path for merged PDF
 */
async function mergePdfs(pdfPaths, outputPath) {
  try {
    // Use pdf-lib for merging (works everywhere, no external tools)
    const mergedPdf = await PDFDocument.create();

    for (const pdfPath of pdfPaths) {
      const pdfBuffer = await fs.readFile(pdfPath);
      const pdf = await PDFDocument.load(pdfBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    // Save merged PDF
    const mergedBuffer = await mergedPdf.save();

    // Add page numbers (skip first page - cover)
    const numberedBuffer = await addPageNumbers(Buffer.from(mergedBuffer), 2);

    await fs.writeFile(outputPath, numberedBuffer);
    console.log(`Merged ${pdfPaths.length} PDFs with page numbering`);
    return;
  } catch (error) {
    console.log('pdf-lib merge failed, trying external tools...', error.message);
  }

  // Fallback: Try using pdftk (if available)
  try {
    const inputFiles = pdfPaths.map(p => `"${p}"`).join(' ');
    await execAsync(`pdftk ${inputFiles} cat output "${outputPath}"`, { timeout: 120000 });
    // Add page numbers to result
    const buffer = await fs.readFile(outputPath);
    const numbered = await addPageNumbers(buffer, 2);
    await fs.writeFile(outputPath, numbered);
    return;
  } catch {
    console.log('pdftk not available, trying alternative method...');
  }

  // Try using pdfunite (poppler-utils)
  try {
    const inputFiles = pdfPaths.map(p => `"${p}"`).join(' ');
    await execAsync(`pdfunite ${inputFiles} "${outputPath}"`, { timeout: 120000 });
    // Add page numbers to result
    const buffer = await fs.readFile(outputPath);
    const numbered = await addPageNumbers(buffer, 2);
    await fs.writeFile(outputPath, numbered);
    return;
  } catch {
    console.log('pdfunite not available, using simple copy for single file...');
  }

  // Fallback: if only one PDF, just copy it
  if (pdfPaths.length === 1) {
    const buffer = await fs.readFile(pdfPaths[0]);
    const numbered = await addPageNumbers(buffer, 2);
    await fs.writeFile(outputPath, numbered);
    return;
  }

  throw new Error('No PDF merge tool available. Install pdftk or poppler-utils.');
}

/**
 * Clean up old temporary files (older than 1 hour)
 */
async function cleanupTempFiles() {
  try {
    const entries = await fs.readdir(TEMP_DIR, { withFileTypes: true });
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(TEMP_DIR, entry.name);
        const stats = await fs.stat(dirPath);

        if (stats.mtimeMs < oneHourAgo) {
          await fs.rm(dirPath, { recursive: true });
          console.log(`Cleaned up: ${dirPath}`);
        }
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupTempFiles, 30 * 60 * 1000);

// ============ API ROUTES ============

/**
 * Health check
 */
app.get('/api/health', async (req, res) => {
  const libreOfficeAvailable = await checkLibreOffice();
  res.json({
    status: 'ok',
    libreOffice: libreOfficeAvailable,
    timestamp: new Date().toISOString()
  });
});

/**
 * Convert single DOCX to PDF
 * POST /api/convert
 * Body: multipart/form-data with 'file' field
 */
app.post('/api/convert', upload.single('file'), async (req, res) => {
  const sessionDir = path.join(TEMP_DIR, req.sessionId);

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`Processing file: ${req.file.originalname}`);

    // If already PDF, just return it
    if (req.file.originalname.endsWith('.pdf')) {
      const pdfBuffer = await fs.readFile(req.file.path);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${req.file.originalname}"`);
      return res.send(pdfBuffer);
    }

    // Convert DOCX to PDF
    const pdfPath = await convertDocxToPdf(req.file.path, sessionDir);
    const pdfBuffer = await fs.readFile(pdfPath);

    // Clean up
    await fs.unlink(req.file.path).catch(() => {});
    await fs.unlink(pdfPath).catch(() => {});

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(req.file.originalname, '.docx')}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate journal PDF from multiple files
 * POST /api/generate-journal
 * Body: multipart/form-data with:
 *   - coverPage: cover page DOCX
 *   - descriptionPage: description DOCX
 *   - articles[]: array of article DOCX files
 *   - finalPage: final page DOCX
 *   - articlesMetadata: JSON string with article metadata for TOC
 */
app.post('/api/generate-journal', upload.fields([
  { name: 'coverPage', maxCount: 1 },
  { name: 'descriptionPage', maxCount: 1 },
  { name: 'articles', maxCount: 100 },
  { name: 'finalPage', maxCount: 1 }
]), async (req, res) => {
  const sessionDir = path.join(TEMP_DIR, req.sessionId);
  const pdfPaths = [];

  try {
    console.log('Generating journal PDF...');
    console.log('Files received:', {
      coverPage: req.files.coverPage?.[0]?.originalname,
      descriptionPage: req.files.descriptionPage?.[0]?.originalname,
      articles: req.files.articles?.map(f => f.originalname),
      finalPage: req.files.finalPage?.[0]?.originalname
    });

    // Parse article metadata for TOC
    let articlesMetadata = [];
    try {
      if (req.body.articlesMetadata) {
        articlesMetadata = JSON.parse(req.body.articlesMetadata);
        console.log('Articles metadata received:', articlesMetadata.length, 'articles');
      }
    } catch (e) {
      console.warn('Failed to parse articles metadata:', e.message);
    }

    // Track page counts for each section
    let currentPage = 1; // Cover page
    const pdfPageCounts = {};

    // 1. Process cover page
    if (req.files.coverPage?.[0]) {
      const file = req.files.coverPage[0];
      console.log('Processing cover:', file.originalname);
      if (file.originalname.endsWith('.pdf')) {
        pdfPaths.push({ path: file.path, type: 'cover' });
      } else {
        const pdfPath = await convertDocxToPdf(file.path, sessionDir);
        pdfPaths.push({ path: pdfPath, type: 'cover' });
      }
      // Count pages in cover
      const coverBuffer = await fs.readFile(pdfPaths[pdfPaths.length - 1].path);
      const coverDoc = await PDFDocument.load(coverBuffer);
      pdfPageCounts.cover = coverDoc.getPageCount();
      currentPage += pdfPageCounts.cover;
    }

    // 2. Process description page
    if (req.files.descriptionPage?.[0]) {
      const file = req.files.descriptionPage[0];
      console.log('Processing description:', file.originalname);
      if (file.originalname.endsWith('.pdf')) {
        pdfPaths.push({ path: file.path, type: 'description' });
      } else {
        const pdfPath = await convertDocxToPdf(file.path, sessionDir);
        pdfPaths.push({ path: pdfPath, type: 'description' });
      }
      // Count pages in description
      const descBuffer = await fs.readFile(pdfPaths[pdfPaths.length - 1].path);
      const descDoc = await PDFDocument.load(descBuffer);
      pdfPageCounts.description = descDoc.getPageCount();
      currentPage += pdfPageCounts.description;
    }

    // 3. Generate Table of Contents (estimate page numbers first)
    const tocStartPage = currentPage;
    let tocPagesEstimate = 1;
    if (articlesMetadata.length > 15) {
      tocPagesEstimate = Math.ceil(articlesMetadata.length / 15);
    }
    currentPage += tocPagesEstimate;

    // 4. Process articles and calculate their page numbers
    const articlePdfPaths = [];
    const articlesWithPages = [];

    if (req.files.articles) {
      // Sort articles according to metadata order
      const sortedArticles = [...req.files.articles];
      if (articlesMetadata.length > 0) {
        sortedArticles.sort((a, b) => {
          const indexA = articlesMetadata.findIndex(m => m.fileName === a.originalname);
          const indexB = articlesMetadata.findIndex(m => m.fileName === b.originalname);
          return indexA - indexB;
        });
      }

      for (const file of sortedArticles) {
        console.log(`Processing article: ${file.originalname}`);

        let pdfPath;
        if (file.originalname.endsWith('.pdf')) {
          pdfPath = file.path;
        } else {
          pdfPath = await convertDocxToPdf(file.path, sessionDir);
        }

        // Count pages in this article
        const articleBuffer = await fs.readFile(pdfPath);
        const articleDoc = await PDFDocument.load(articleBuffer);
        const articlePageCount = articleDoc.getPageCount();

        // Find metadata for this article
        const meta = articlesMetadata.find(m => m.fileName === file.originalname) || {
          title: file.originalname.replace(/\.[^/.]+$/, ''),
          author: 'Автор не указан',
          section: SECTION_ORDER[0]
        };

        articlesWithPages.push({
          ...meta,
          pageNumber: currentPage,
          pageCount: articlePageCount
        });

        articlePdfPaths.push(pdfPath);
        currentPage += articlePageCount;
      }
    }

    // 5. Generate TOC with actual page numbers
    let tocPdfPath = null;
    if (articlesWithPages.length > 0) {
      console.log('Generating Table of Contents...');
      const tocBuffer = await generateTableOfContentsPdf(articlesWithPages, tocStartPage);
      tocPdfPath = path.join(sessionDir, `toc-${Date.now()}.pdf`);
      await fs.writeFile(tocPdfPath, tocBuffer);

      // Recalculate if TOC pages changed
      const tocDoc = await PDFDocument.load(tocBuffer);
      const actualTocPages = tocDoc.getPageCount();
      if (actualTocPages !== tocPagesEstimate) {
        console.log(`TOC pages: estimated ${tocPagesEstimate}, actual ${actualTocPages}`);
        // Adjust article page numbers
        const pageDiff = actualTocPages - tocPagesEstimate;
        articlesWithPages.forEach(article => {
          article.pageNumber += pageDiff;
        });
        // Regenerate TOC with corrected page numbers
        const correctedTocBuffer = await generateTableOfContentsPdf(articlesWithPages, tocStartPage);
        await fs.writeFile(tocPdfPath, correctedTocBuffer);
      }
    }

    // 6. Process final page
    let finalPdfPath = null;
    if (req.files.finalPage?.[0]) {
      const file = req.files.finalPage[0];
      console.log('Processing final page:', file.originalname);
      if (file.originalname.endsWith('.pdf')) {
        finalPdfPath = file.path;
      } else {
        finalPdfPath = await convertDocxToPdf(file.path, sessionDir);
      }
    }

    // 7. Merge all PDFs in correct order
    const allPdfPaths = [];

    // Cover
    const coverPdf = pdfPaths.find(p => p.type === 'cover');
    if (coverPdf) allPdfPaths.push(coverPdf.path);

    // Description
    const descPdf = pdfPaths.find(p => p.type === 'description');
    if (descPdf) allPdfPaths.push(descPdf.path);

    // TOC
    if (tocPdfPath) allPdfPaths.push(tocPdfPath);

    // Articles
    allPdfPaths.push(...articlePdfPaths);

    // Final
    if (finalPdfPath) allPdfPaths.push(finalPdfPath);

    console.log('Merging PDFs:', allPdfPaths.length, 'files');

    // Merge all PDFs
    const outputPath = path.join(sessionDir, `journal-${Date.now()}.pdf`);
    await mergePdfs(allPdfPaths, outputPath);

    const pdfBuffer = await fs.readFile(outputPath);

    // Clean up
    for (const pdfPath of allPdfPaths) {
      await fs.unlink(pdfPath).catch(() => {});
    }
    await fs.unlink(outputPath).catch(() => {});

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="journal-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Journal generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Convert DOCX to PDF (base64 input/output for easier frontend integration)
 * POST /api/convert-base64
 * Body: { filename: string, data: base64 string }
 */
app.post('/api/convert-base64', async (req, res) => {
  const sessionDir = path.join(TEMP_DIR, req.sessionId || uuidv4());

  try {
    await fs.mkdir(sessionDir, { recursive: true });

    const { filename, data } = req.body;

    if (!filename || !data) {
      return res.status(400).json({ error: 'filename and data are required' });
    }

    // Decode base64 and save to temp file
    const buffer = Buffer.from(data, 'base64');
    const inputPath = path.join(sessionDir, filename);
    await fs.writeFile(inputPath, buffer);

    // If already PDF, return as-is
    if (filename.endsWith('.pdf')) {
      return res.json({
        filename: filename,
        data: data
      });
    }

    // Convert to PDF
    const pdfPath = await convertDocxToPdf(inputPath, sessionDir);
    const pdfBuffer = await fs.readFile(pdfPath);

    // Clean up
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(pdfPath).catch(() => {});

    res.json({
      filename: filename.replace(/\.docx?$/i, '.pdf'),
      data: pdfBuffer.toString('base64')
    });

  } catch (error) {
    console.error('Base64 conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files in production (frontend build)
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
try {
  await fs.access(PUBLIC_DIR);
  app.use(express.static(PUBLIC_DIR));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  console.log('📁 Serving static files from:', PUBLIC_DIR);
} catch {
  console.log('📁 No public directory found (development mode)');
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: error.message || 'Internal server error' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`\n🚀 AI-Redactor Server running on http://localhost:${PORT}`);

  const libreOfficeAvailable = await checkLibreOffice();
  if (libreOfficeAvailable) {
    console.log('✅ LibreOffice is available');
  } else {
    console.log('⚠️  LibreOffice not found. Please install it:');
    console.log('   Ubuntu/Debian: sudo apt install libreoffice');
    console.log('   macOS: brew install --cask libreoffice');
    console.log('   Windows: Download from https://www.libreoffice.org/');
  }

  console.log('\nAPI Endpoints:');
  console.log('  GET  /api/health          - Health check');
  console.log('  POST /api/convert         - Convert single DOCX to PDF');
  console.log('  POST /api/convert-base64  - Convert DOCX to PDF (base64)');
  console.log('  POST /api/generate-journal - Generate journal from multiple files');
  console.log('');
});
