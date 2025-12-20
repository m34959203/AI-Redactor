/**
 * AI-Redactor Backend Server
 * Provides DOCX to PDF conversion using LibreOffice
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
 * Merge multiple PDF files using LibreOffice or pdftk
 * @param {string[]} pdfPaths - Array of PDF file paths
 * @param {string} outputPath - Path for merged PDF
 */
async function mergePdfs(pdfPaths, outputPath) {
  // Try using pdftk first (if available)
  try {
    const inputFiles = pdfPaths.map(p => `"${p}"`).join(' ');
    await execAsync(`pdftk ${inputFiles} cat output "${outputPath}"`, { timeout: 120000 });
    return;
  } catch {
    console.log('pdftk not available, trying alternative method...');
  }

  // Try using pdfunite (poppler-utils)
  try {
    const inputFiles = pdfPaths.map(p => `"${p}"`).join(' ');
    await execAsync(`pdfunite ${inputFiles} "${outputPath}"`, { timeout: 120000 });
    return;
  } catch {
    console.log('pdfunite not available, using simple copy for single file...');
  }

  // Fallback: if only one PDF, just copy it
  if (pdfPaths.length === 1) {
    await fs.copyFile(pdfPaths[0], outputPath);
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

    // Process files in order
    const filesToProcess = [];

    if (req.files.coverPage?.[0]) {
      filesToProcess.push({ file: req.files.coverPage[0], name: 'cover' });
    }

    if (req.files.descriptionPage?.[0]) {
      filesToProcess.push({ file: req.files.descriptionPage[0], name: 'description' });
    }

    if (req.files.articles) {
      req.files.articles.forEach((file, index) => {
        filesToProcess.push({ file, name: `article-${index}` });
      });
    }

    if (req.files.finalPage?.[0]) {
      filesToProcess.push({ file: req.files.finalPage[0], name: 'final' });
    }

    // Convert each file to PDF
    for (const { file, name } of filesToProcess) {
      console.log(`Processing ${name}: ${file.originalname}`);

      if (file.originalname.endsWith('.pdf')) {
        pdfPaths.push(file.path);
      } else {
        const pdfPath = await convertDocxToPdf(file.path, sessionDir);
        pdfPaths.push(pdfPath);
      }
    }

    // Merge all PDFs
    const outputPath = path.join(sessionDir, `journal-${Date.now()}.pdf`);
    await mergePdfs(pdfPaths, outputPath);

    const pdfBuffer = await fs.readFile(outputPath);

    // Clean up
    for (const pdfPath of pdfPaths) {
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
