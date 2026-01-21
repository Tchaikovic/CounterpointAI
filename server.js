const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
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

// OpenRouter proxy endpoint
app.post('/api/chat', async (req, res) => {
    const { messages, apiKey, model, max_tokens } = req.body;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'API key required' });
    }

    try {
        const requestBody = {
            model: model || 'anthropic/claude-3.5-sonnet',
            messages: messages
        };
        
        // Add max_tokens if provided
        if (max_tokens) {
            requestBody.max_tokens = max_tokens;
        }
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'CounterpointAI'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('OpenRouter error:', error);
        res.status(500).json({ error: 'Failed to communicate with OpenRouter' });
    }
});

app.listen(PORT, () => {
    console.log(`CounterpointAI server running at http://localhost:${PORT}`);
});
