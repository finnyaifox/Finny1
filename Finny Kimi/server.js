require('dotenv').config();

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// 📋 API KEYS - DIREKT IM CODE FÜR TESTS
// ============================================
const PDF_CO_API_KEY = 'leeonzo86@gmail.com_cYjsXcXA3N2FU2jD50NTtjbc4uhMQBtBHl5Wv8hN7GndcfgnQEu0W42g8oLyccos';
const COMET_KEY      = 'sk-eQswrHDAMib6n6uxBXHWyZEd1ABdsAAY0JbuoXQ7Rxl1GkrZ';

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║ 🦊 FINNY v9.0 - KI-PDF-Assistent mit KIMI Integration ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// ============================================
// ⚙️ MIDDLEWARE
// ============================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 📦 MULTER FÜR FILE UPLOADS
// ============================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB Limit
});

// ============================================
// 💾 SESSIONS & DATEN SPEICHERUNG
// ============================================
const sessions = new Map();

// ============================================
// 🚀 API ENDPOINTS
// ============================================

// 1. PDF Upload zu PDF.co
app.post('/api/upload-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Keine Datei hochgeladen' });
    }

    const formData = new FormData();
    formData.append('file', req.file.buffer, req.file.originalname);

    const response = await axios.post('https://api.pdf.co/v1/file/upload', formData, {
      headers: {
        'x-api-key': PDF_CO_API_KEY,
        ...formData.getHeaders()
      }
    });

    if (response.data.success && response.data.url) {
      const sessionId = generateSessionId();
      sessions.set(sessionId, {
        pdfUrl: response.data.url,
        fields: [],
        filledFields: {},
        currentFieldIndex: 0
      });

      res.json({ 
        success: true, 
        sessionId: sessionId,
        pdfUrl: response.data.url 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: response.data.message || 'Upload fehlgeschlagen' 
      });
    }
  } catch (error) {
    console.error('Upload Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Upload: ' + error.message 
    });
  }
});

// 2. Formularfelder extrahieren
app.post('/api/extract-fields', async (req, res) => {
  try {
    const { sessionId, pdfUrl } = req.body;
    
    if (!pdfUrl) {
      return res.status(400).json({ success: false, message: 'PDF-URL erforderlich' });
    }

    const response = await axios.post('https://api.pdf.co/v1/pdf/info/fields', {
      url: pdfUrl
    }, {
      headers: {
        'x-api-key': PDF_CO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success && response.data.fields) {
      const fields = response.data.fields.map(field => ({
        name: field.fieldName || field.name,
        type: field.fieldType || 'text',
        value: ''
      }));

      // Session aktualisieren
      if (sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        session.fields = fields;
        sessions.set(sessionId, session);
      }

      res.json({ 
        success: true, 
        fields: fields 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: response.data.message || 'Keine Felder gefunden' 
      });
    }
  } catch (error) {
    console.error('Extract Fields Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Extrahieren: ' + error.message 
    });
  }
});

// 3. KIMI-COMET CHAT INTEGRATION
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message, field } = req.body;

    if (!sessions.has(sessionId))
      return res.status(400).json({ success: false, message: 'Session nicht gefunden' });

    const session = sessions.get(sessionId);

    // CometAPI – kimi-k2-thinking  (NEU: Model + Key)
    const { data } = await axios.post(
      'https://api.cometapi.com/v1/chat/completions',
      {
        model: 'kimi-k2-thinking',          // ← NEU
        messages: [
          {
          role: 'system',
          content: `Du bist Finny, ein hilfreicher KI-Assistent für PDF-Formulare. Du bekommst Formularfelder und stellst dem Nutzer eine Frage nach der anderen. Nach jeder Antwort validierst du kurz und gibst Tipps. Antworte immer auf Deutsch und sei freundlich und professionell.`
        },
        {
          role: 'user',
          content: `Ich habe ein PDF-Formular mit dem Feld "${field.name}". Der Nutzer hat geantwortet: "${message}". Bitte validiere die Antwort und gib eine passende Antwort.`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    }, {
      headers: {
        'Authorization': `Bearer ${COMET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.choices && response.data.choices[0]) {
      const aiResponse = response.data.choices[0].message.content;
      
      res.json({ 
        success: true, 
        response: aiResponse 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Keine Antwort von KIMI erhalten' 
      });
    }
  } catch (error) {
    console.error('KIMI Chat Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler bei KIMI-Integration: ' + error.message 
    });
  }
});

// 4. Feld validieren
app.post('/api/validate-field', async (req, res) => {
  try {
    const { sessionId, fieldName, value } = req.body;
    
    const fieldNameLower = fieldName.toLowerCase();
    let isValid = true;
    let message = '';
    
    // Email-Validierung
    if (fieldNameLower.includes('email')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        isValid = false;
        message = 'Bitte geben Sie eine gültige E-Mail-Adresse ein (z.B. max@example.com)';
      }
    }
    
    // Datum-Validierung
    else if (fieldNameLower.includes('datum') || fieldNameLower.includes('date') || fieldNameLower.includes('geburts')) {
      const germanDateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
      if (!germanDateRegex.test(value)) {
        isValid = false;
        message = 'Bitte geben Sie das Datum im Format TT.MM.JJJJ ein (z.B. 15.03.1990)';
      }
    }
    
    // Telefon-Validierung
    else if (fieldNameLower.includes('telefon') || fieldNameLower.includes('phone')) {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''))) {
        isValid = false;
        message = 'Bitte geben Sie eine gültige Telefonnummer ein';
      }
    }

    res.json({ 
      success: true, 
      isValid: isValid,
      message: message 
    });
  } catch (error) {
    console.error('Validation Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler bei Validierung: ' + error.message 
    });
  }
});

// 5. PDF ausfüllen
app.post('/api/fill-pdf', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessions.has(sessionId)) {
      return res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    }

    const session = sessions.get(sessionId);
    
    const response = await axios.post('https://api.pdf.co/v1/pdf/edit/add', {
      url: session.pdfUrl,
      fields: session.filledFields
    }, {
      headers: {
        'x-api-key': PDF_CO_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success && response.data.url) {
      res.json({ 
        success: true, 
        pdfUrl: response.data.url 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: response.data.message || 'Fehler beim Ausfüllen' 
      });
    }
  } catch (error) {
    console.error('Fill PDF Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Ausfüllen: ' + error.message 
    });
  }
});

// 6. Session-Daten abrufen
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    res.json({
      success: true,
      session: {
        fields: session.fields,
        filledFields: session.filledFields,
        currentFieldIndex: session.currentFieldIndex
      }
    });
  } else {
    res.status(404).json({ success: false, message: 'Session nicht gefunden' });
  }
});

// 7. Feld aktualisieren
app.post('/api/update-field', (req, res) => {
  try {
    const { sessionId, fieldName, value } = req.body;
    
    if (sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      session.filledFields[fieldName] = value;
      sessions.set(sessionId, session);
      
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    }
  } catch (error) {
    console.error('Update Field Error:', error.message);
    res.status(500).json({ success: false, message: 'Fehler beim Aktualisieren' });
  }
});

// ============================================
// 🛠️ HILFSFUNKTIONEN
// ============================================
function generateSessionId() {
  return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// ============================================
// 🚀 SERVER START
// ============================================
app.listen(PORT, () => {
  console.log(`🦊 Finny Server läuft auf Port ${PORT}`);
  console.log(`📡 API Endpoints bereit unter /api/*`);
  console.log(`🔑 PDF.co API: ${PDF_CO_API_KEY ? '✅ Verbunden' : '❌ Fehlend'}`);
  console.log(`🤖 Comet/Kimi API: ${COMET_KEY ? '✅ Verbunden' : '❌ Fehlend'}`);
});

// ============================================
// 🎯 SPA-FALLBACK – index.html für alle nicht-API-Routen
// ============================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 📋 FEHLERBEHANDLUNG (MUSS ganz unten stehen)
// ============================================
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message);
  res.status(500).json({ 
    success: false, 
    message: 'Interner Server Fehler: ' + err.message 
  });
});

module.exports = app;
