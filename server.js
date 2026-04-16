require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const JSZip = require('jszip');
const { musicXmlToAbc } = require('./utils/musicxml-to-abc');

const app = express();
const PORT = process.env.PORT || 3000;
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '50mb';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-3.5-sonnet';
const OPENROUTER_HTTP_REFERER = process.env.OPENROUTER_HTTP_REFERER || `http://localhost:${PORT}`;
const OPENROUTER_X_TITLE = process.env.OPENROUTER_X_TITLE || 'CounterpointAI';
const AUDIVERIS_BIN = process.env.AUDIVERIS_BIN || 'audiveris';
const PDF_CONVERSION_TIMEOUT_MS = Number(process.env.PDF_CONVERSION_TIMEOUT_MS || 180000);
const PDF_JOB_RETENTION_MS = Number(process.env.PDF_JOB_RETENTION_MS || 3600000);
const conversionJobs = new Map();

// Middleware
app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.mscz', '.musicxml', '.mxl', '.xml'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: .mscz, .musicxml, .mxl, .xml'));
        }
    }
});

const pdfUpload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.pdf') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: .pdf'));
        }
    }
});

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function collectFilesRecursive(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFilesRecursive(fullPath));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

function createConversionJob(jobId, fileName) {
    const job = {
        jobId,
        fileName,
        stage: 'upload_received',
        status: 'running',
        message: 'PDF uploaded. Preparing conversion...',
        error: null,
        errorCode: null,
        abc: null,
        sourceXmlPath: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    conversionJobs.set(jobId, job);
    return job;
}

function updateConversionJob(jobId, updates) {
    const existing = conversionJobs.get(jobId);
    if (!existing) return null;

    const nextJob = {
        ...existing,
        ...updates,
        updatedAt: Date.now()
    };
    conversionJobs.set(jobId, nextJob);
    return nextJob;
}

function scheduleJobCleanup(jobId) {
    setTimeout(() => {
        conversionJobs.delete(jobId);
    }, PDF_JOB_RETENTION_MS);
}

async function extractMusicXmlContent(filePath) {
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.xml') || lowerPath.endsWith('.musicxml')) {
        return fs.readFileSync(filePath, 'utf-8');
    }

    if (!lowerPath.endsWith('.mxl')) {
        throw new Error(`Unsupported MusicXML output format: ${path.extname(filePath)}`);
    }

    const zipBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const containerFile = zip.file('META-INF/container.xml');

    if (!containerFile) {
        throw new Error('No META-INF/container.xml found in .mxl archive');
    }

    const containerXml = await containerFile.async('string');
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/i);
    const scorePath = rootfileMatch ? rootfileMatch[1] : null;

    if (scorePath) {
        const scoreFile = zip.file(scorePath);
        if (!scoreFile) {
            throw new Error(`Referenced score file not found in .mxl archive: ${scorePath}`);
        }
        return scoreFile.async('string');
    }

    const fallbackFile = Object.keys(zip.files).find((name) =>
        name.toLowerCase().endsWith('.xml') && !name.startsWith('META-INF/')
    );

    if (!fallbackFile) {
        throw new Error('No score file found in .mxl archive');
    }

    return zip.file(fallbackFile).async('string');
}

function classifyConversionError(error) {
    const message = error.message || 'Failed to convert PDF';

    if (message.includes('ENOENT')) {
        return {
            code: 'audiveris_not_found',
            stage: 'failed',
            userMessage: 'Audiveris could not be started. Check AUDIVERIS_BIN or your PATH.'
        };
    }

    if (message.includes('timed out')) {
        return {
            code: 'audiveris_timeout',
            stage: 'failed',
            userMessage: 'Audiveris timed out while processing this PDF.'
        };
    }

    if (message.includes('no MusicXML output')) {
        return {
            code: 'no_musicxml_output',
            stage: 'failed',
            userMessage: 'Audiveris finished, but no MusicXML output was produced.'
        };
    }

    if (message.includes('MusicXML content is empty') || message.includes('No <part> found in MusicXML')) {
        return {
            code: 'abc_conversion_failed',
            stage: 'failed',
            userMessage: 'MusicXML was produced, but converting it into ABC failed.'
        };
    }

    if (message.includes('Failed to start Audiveris') || message.includes('Audiveris failed')) {
        return {
            code: 'audiveris_failed',
            stage: 'failed',
            userMessage: 'Audiveris failed while reading the PDF.'
        };
    }

    return {
        code: 'pdf_conversion_failed',
        stage: 'failed',
        userMessage: 'PDF conversion failed.'
    };
}

function runAudiveris(inputPdfPath, outputDir, jobId) {
    const args = ['-batch', '-export', '-output', outputDir, inputPdfPath];
    return new Promise((resolve, reject) => {
        // #region agent log
        fetch('http://127.0.0.1:7891/ingest/c1cb726f-30e5-4bf5-80c0-4514dc096df7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faee3c'},body:JSON.stringify({sessionId:'faee3c',runId:'pre-fix',hypothesisId:'H1',location:'server.js:97',message:'runAudiveris_spawn_attempt',data:{audiverisBin:AUDIVERIS_BIN,args,timeoutMs:PDF_CONVERSION_TIMEOUT_MS,inputExt:path.extname(inputPdfPath),outputDir:path.basename(outputDir)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const proc = spawn(AUDIVERIS_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        updateConversionJob(jobId, {
            stage: 'audiveris_running',
            status: 'running',
            message: 'Audiveris is processing the PDF...'
        });

        const timeoutHandle = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGKILL');
        }, PDF_CONVERSION_TIMEOUT_MS);

        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        proc.on('error', (error) => {
            clearTimeout(timeoutHandle);
            // #region agent log
            fetch('http://127.0.0.1:7891/ingest/c1cb726f-30e5-4bf5-80c0-4514dc096df7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faee3c'},body:JSON.stringify({sessionId:'faee3c',runId:'pre-fix',hypothesisId:'H2',location:'server.js:120',message:'runAudiveris_spawn_error',data:{audiverisBin:AUDIVERIS_BIN,errorMessage:error.message,errorCode:error.code||null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            reject(new Error(`Failed to start Audiveris (${AUDIVERIS_BIN}): ${error.message}`));
        });

        proc.on('close', (code) => {
            clearTimeout(timeoutHandle);
            // #region agent log
            fetch('http://127.0.0.1:7891/ingest/c1cb726f-30e5-4bf5-80c0-4514dc096df7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faee3c'},body:JSON.stringify({sessionId:'faee3c',runId:'pre-fix',hypothesisId:'H3',location:'server.js:127',message:'runAudiveris_close',data:{code,timedOut,stdoutLength:stdout.length,stderrLength:stderr.length},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (timedOut) {
                reject(new Error(`Audiveris timed out after ${PDF_CONVERSION_TIMEOUT_MS}ms`));
                return;
            }

            if (code !== 0) {
                reject(new Error(`Audiveris failed (exit ${code}): ${stderr || stdout || 'No output'}`));
                return;
            }

            resolve({ stdout, stderr });
        });
    });
}

async function processPdfConversion(jobId, inputPdfPath, outputDir) {
    try {
        updateConversionJob(jobId, {
            stage: 'starting_audiveris',
            status: 'running',
            message: 'Starting Audiveris...'
        });

        await runAudiveris(inputPdfPath, outputDir, jobId);

        updateConversionJob(jobId, {
            stage: 'searching_musicxml',
            status: 'running',
            message: 'Looking for MusicXML output...'
        });

        const generatedFiles = collectFilesRecursive(outputDir);
        const xmlFile = generatedFiles.find((filePath) =>
            filePath.toLowerCase().endsWith('.xml') ||
            filePath.toLowerCase().endsWith('.musicxml') ||
            filePath.toLowerCase().endsWith('.mxl')
        );

        if (!xmlFile) {
            throw new Error('Audiveris completed but no MusicXML output was found');
        }

        updateConversionJob(jobId, {
            stage: 'musicxml_found',
            status: 'running',
            message: 'MusicXML found. Converting to ABC...',
            sourceXmlPath: path.relative(__dirname, xmlFile)
        });

        const xmlContent = await extractMusicXmlContent(xmlFile);

        updateConversionJob(jobId, {
            stage: 'converting_to_abc',
            status: 'running',
            message: 'Converting MusicXML into ABC notation...'
        });

        const abc = musicXmlToAbc(xmlContent);

        updateConversionJob(jobId, {
            stage: 'completed',
            status: 'completed',
            message: 'PDF import complete. Score ready to load.',
            abc
        });
    } catch (error) {
        const classified = classifyConversionError(error);
        console.error('PDF conversion error:', error);

        updateConversionJob(jobId, {
            stage: classified.stage,
            status: 'failed',
            message: classified.userMessage,
            error: error.message || 'Failed to convert PDF to MusicXML/ABC',
            errorCode: classified.code
        });
    } finally {
        if (fs.existsSync(inputPdfPath)) {
            fs.unlinkSync(inputPdfPath);
        }
        scheduleJobCleanup(jobId);
    }
}

// Upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ 
        success: true, 
        filename: req.file.filename,
        path: `/uploads/${req.file.filename}`
    });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/api/convert-pdf/start', pdfUpload.single('file'), async (req, res) => {
    // #region agent log
    fetch('http://127.0.0.1:7891/ingest/c1cb726f-30e5-4bf5-80c0-4514dc096df7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faee3c'},body:JSON.stringify({sessionId:'faee3c',runId:'pre-fix',hypothesisId:'H4',location:'server.js:160',message:'convertPdf_request_received',data:{hasFile:Boolean(req.file),originalName:req.file?.originalname||null,mimetype:req.file?.mimetype||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const inputPdfPath = req.file.path;
    const jobId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const outputDir = path.join(__dirname, 'uploads', 'processed_scores', jobId);
    ensureDir(outputDir);

    createConversionJob(jobId, req.file.originalname);
    processPdfConversion(jobId, inputPdfPath, outputDir);

    return res.status(202).json({
        success: true,
        jobId,
        stage: 'upload_received',
        message: 'PDF uploaded. Preparing conversion...'
    });
});

app.get('/api/convert-pdf/:jobId/status', (req, res) => {
    const job = conversionJobs.get(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'PDF conversion job not found' });
    }

    return res.json({
        jobId: job.jobId,
        fileName: job.fileName,
        stage: job.stage,
        status: job.status,
        message: job.message,
        error: job.error,
        errorCode: job.errorCode,
        sourceXmlPath: job.sourceXmlPath,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
    });
});

app.get('/api/convert-pdf/:jobId/result', (req, res) => {
    const job = conversionJobs.get(req.params.jobId);
    if (!job) {
        return res.status(404).json({ error: 'PDF conversion job not found' });
    }

    if (job.status === 'failed') {
        return res.status(409).json({
            error: job.error || 'PDF conversion failed',
            errorCode: job.errorCode,
            stage: job.stage
        });
    }

    if (job.status !== 'completed') {
        return res.status(202).json({
            status: job.status,
            stage: job.stage,
            message: job.message
        });
    }

    return res.json({
        success: true,
        abc: job.abc,
        sourceXmlPath: job.sourceXmlPath
    });
});

// OpenRouter proxy endpoint
app.post('/api/chat', async (req, res) => {
    const { messages, model, max_tokens } = req.body;

    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'Server missing OPENROUTER_API_KEY configuration' });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required' });
    }

    try {
        const requestBody = {
            model: model || OPENROUTER_DEFAULT_MODEL,
            messages: messages
        };
        
        // Add max_tokens if provided
        if (max_tokens) {
            requestBody.max_tokens = max_tokens;
        }
        
        const response = await fetch(OPENROUTER_BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': OPENROUTER_HTTP_REFERER,
                'X-Title': OPENROUTER_X_TITLE
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('OpenRouter error:', error);
        res.status(500).json({ error: 'Failed to communicate with OpenRouter' });
    }
});

app.listen(PORT, () => {
    if (!OPENROUTER_API_KEY) {
        console.warn('⚠️ OPENROUTER_API_KEY is not set. AI chat will fail until configured in .env.');
    }
    console.log(`CounterpointAI server running at http://localhost:${PORT}`);
});
