require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs'); // WICHTIG: Für Ordner-Erstellung

const app = express();

// ============================================
// 🚀 RENDER KOMPATIBILITÄT & SICHERHEIT
// ============================================
const PORT = process.env.PORT || 3001;
const PDF_CO_API_KEY = process.env.PDFCO_API_KEY; // Kein Fallback!
const COMET_KEY = process.env.COMETAPI_KEY;       // Kein Fallback!
const MODEL_NAME = process.env.MODEL_NAME || 'claude-sonnet-4-5-20250929-thinking';

// Prüfe beim Server-Start
if (!PDF_CO_API_KEY || !COMET_KEY) {
  console.error('\n❌ FEHLER: API-Keys fehlen!');
  console.error('👉 Setze PDFCO_API_KEY und COMETAPI_KEY in Render Environment Variables.');
  process.exit(1); // Server stoppen
}

// ============================================
// 📁 SESSIONS-ORDNER AUTOMATISCH ERSTELLEN
// ============================================
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  console.log('✅ Sessions-Verzeichnis erstellt:', sessionsDir);
}

// ============================================
// ⚙️ MIDDLEWARE (STRIKTE REIHENFOLGE!)
// ============================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({ origin: true, credentials: true })); // ⭐ credentials: true
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 💾 KORREKTE SESSION-PERSISTENZ
// ============================================
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me-in-production-12345',
  resave: false,
  saveUninitialized: false,
  store: new FileStore({ path: './sessions' }),
  cookie: { 
    secure: false,      // Auf true setzen wenn HTTPS aktiv
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'     // ⭐ WICHTIG für Cross-Origin-Cookies
  },
  name: 'finny.session'
}));

// ============================================
// 📦 MULTER UPLOAD
// ============================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// ============================================
// 🔥 FELD-HINTS (gekürzt für Übersicht)
// ============================================
const FIELD_HINTS = {
  'Ort und Nummer des Registereintrages': {
    hint: 'Das zuständige Amtsgericht und die Handelsregisternummer',
    example: 'Amtsgericht München, HRB 12345',
    details: 'Die HRB-Nummer findest du im Handelsregister.',
    tips: ['Beginne mit "Amtsgericht [Stadt]"', 'Die HRB-Nummer liegt zwischen HRB 1 und HRB 999999']
  },
  // ... (alle anderen Felder wie vorher) ...
  'Datum der Unterschrift': {
    hint: 'Das Datum, an dem du das Formular unterzeichnest',
    example: '07.12.2025',
    details: 'Normalerweise heute oder das geplante Unterzeichnungsdatum.',
    tips: ['Format: TT.MM.YYYY', 'Darf nicht in der Zukunft liegen']
  }
};

// ============================================
// 🚀 API ENDPOINTS
// ============================================

// 1. PDF Upload
app.post('/api/upload-pdf', upload.single('file'), async (req, res) => {
  console.log('\n[UPLOAD] ➜ /api/upload-pdf aufgerufen');
  try {
    if (!req.file) {
      console.warn('[UPLOAD] ⚠️ Keine Datei empfangen');
      return res.status(400).json({ success: false, message: 'Keine Datei hochgeladen' });
    }

    const formData = new FormData();
    formData.append('file', req.file.buffer, req.file.originalname);

    const response = await axios.post('https://api.pdf.co/v1/file/upload', formData, {
      headers: { 'x-api-key': PDF_CO_API_KEY, ...formData.getHeaders() }
    });

    if (!response.data.error && response.data.url) {
      const sessionId = generateSessionId();
      
      if (!req.session.sessions) req.session.sessions = {};
      req.session.sessions[sessionId] = {
        pdfUrl: response.data.url,
        fields: [],
        filledFields: {},
        currentFieldIndex: 0
      };
      
      console.log(`[UPLOAD] 📦 Session erstellt: ${sessionId}`);
      res.json({ success: true, sessionId: sessionId, pdfUrl: response.data.url });
    } else {
      console.error('[UPLOAD] ❌ PDF.co Fehler:', response.data.message);
      res.status(400).json({ success: false, message: response.data.message || 'Upload fehlgeschlagen' });
    }
  } catch (error) {
    console.error('[UPLOAD] 💥 Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler beim Upload: ' + error.message });
  }
});

// 2. Felder extrahieren
app.post('/api/extract-fields', async (req, res) => {
  console.log('\n[EXTRACT] ➜ /api/extract-fields aufgerufen');
  try {
    const { sessionId, pdfUrl } = req.body;
    if (!pdfUrl) return res.status(400).json({ success: false, message: 'PDF-URL erforderlich' });

    const response = await axios.post('https://api.pdf.co/v1/pdf/info/fields', { url: pdfUrl }, {
      headers: { 'x-api-key': PDF_CO_API_KEY, 'Content-Type': 'application/json' }
    });

    const rawFields = response.data.info?.FieldsInfo?.Fields || [];
    if (rawFields.length === 0) {
      console.warn('[EXTRACT] ⚠️ Keine Formularfelder gefunden');
      return res.status(400).json({ success: false, message: 'Keine Formularfelder in dieser PDF gefunden' });
    }

    const fields = rawFields.map(f => ({
      name: f.FieldName || f.fieldName || f.name,
      type: f.Type || f.type || 'text',
      value: ''
    }));

    if (req.session.sessions?.[sessionId]) {
      req.session.sessions[sessionId].fields = fields;
    }

    console.log(`[EXTRACT] 📋 ${fields.length} Felder gefunden`);
    res.json({ success: true, fields });
  } catch (error) {
    console.error('[EXTRACT] 💥 Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler beim Extrahieren: ' + error.message });
  }
});

// 3. KIMI/COMET Chat
app.post('/api/chat', async (req, res) => {
  console.log('\n[CHAT] ➜ /api/chat aufgerufen');
  try {
    const { sessionId, message, field } = req.body;
    
    if (!sessionId || !message || !field?.name) {
      return res.status(400).json({ success: false, message: 'Fehlende Parameter' });
    }

    if (!req.session.sessions?.[sessionId]) {
      console.warn('[CHAT] ⚠️ Session nicht gefunden');
      return res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    }

    const lowerMsg = message.trim().toLowerCase();
    const hint = FIELD_HINTS[field.name];

    // Befehle
    if (lowerMsg === 'hilfe' || lowerMsg === 'help') {
      const reply = hint ? `${hint.hint}\n\nBeispiel: ${hint.example}\n\nDetails: ${hint.details}` : 'Keine weiteren Hinweise vorhanden.';
      console.log('[CHAT] ℹ️ Befehl "hilfe" erkannt');
      return res.json({ success: true, response: reply });
    }
    
    if (lowerMsg === 'beispiel' || lowerMsg === 'example') {
      const reply = hint ? `Beispiel: ${hint.example}\n\nTips: ${hint.tips.join(', ')}` : 'Kein Beispiel vorhanden.';
      console.log('[CHAT] ℹ️ Befehl "beispiel" erkannt');
      return res.json({ success: true, response: reply });
    }
    
    if (['skip', 'weiter', 'überspringen'].includes(lowerMsg)) {
      console.log('[CHAT] ⏭️ Feld übersprungen');
      return res.json({ success: true, response: 'Feld übersprungen', skip: true });
    }

    // KI-Anfrage mit NEUEM MODEL
    console.log('[CHAT] ➡️ Sende an CometAPI mit Model:', MODEL_NAME);
    const response = await axios.post(
      'https://api.cometapi.com/v1/chat/completions',
      {
        model: MODEL_NAME, // ⭐ NEUES MODEL
        messages: [
          { role: 'system', content: `Du bist Finny, ein hilfreicher KI-Assistent für PDF-Formulare. Stelle dem Nutzer eine Frage nach der anderen, validiere kurz und gib Tipps. Antworte immer auf Deutsch und sei freundlich und professionell.` },
          { role: 'user', content: `Ich habe ein PDF-Formular mit dem Feld "${field.name}". Der Nutzer hat geantwortet: "${message}". Bitte validiere die Antwort und gib eine passende Antwort.` }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      { headers: { Authorization: `Bearer ${COMET_KEY}`, 'Content-Type': 'application/json' } }
    );

    const aiResponse = response.data.choices?.[0]?.message?.content || 'Keine Antwort';
    res.json({ success: true, response: aiResponse });
  } catch (error) {
    console.error('[CHAT] 💥 Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler bei Comet-API: ' + error.message });
  }
});

// 4. Feld validieren
app.post('/api/validate-field', async (req, res) => {
  console.log('\n[VALID] ➜ /api/validate-field aufgerufen');
  try {
    const { sessionId, fieldName, value } = req.body;
    console.log(`[VALID] 🧪 Feld: ${fieldName} | Wert: ${value}`);
    
    // TODO: Implementiere echte Validierung
    res.json({ success: true, isValid: true, message: '' });
  } catch (error) {
    console.error('[VALID] 💥 Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler bei Validierung: ' + error.message });
  }
});

// 5. Feld aktualisieren (Fehlende Route!)
app.post('/api/update-field', async (req, res) => {
  console.log('\n[UPDATE] ➜ /api/update-field aufgerufen');
  try {
    const { sessionId, fieldName, value } = req.body;
    
    if (!req.session.sessions?.[sessionId]) {
      console.warn('[UPDATE] ⚠️ Session nicht gefunden');
      return res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    }
    
    req.session.sessions[sessionId].filledFields[fieldName] = value;
    await req.session.save(); // WICHTIG: Speichern erzwingen
    
    console.log(`[UPDATE] ✅ Feld gespeichert: ${fieldName} = ${value}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[UPDATE] 💥 Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler beim Speichern: ' + error.message });
  }
});

// 6. PDF ausfüllen
app.post('/api/fill-pdf', async (req, res) => {
  console.log('\n[FILL] ➜ /api/fill-pdf aufgerufen');
  try {
    const { sessionId } = req.body;
    
    if (!req.session.sessions?.[sessionId]) {
      return res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    }
    
    const session = req.session.sessions[sessionId];
    console.log(`[FILL] 🖨️ Fülle PDF mit Feldern:`, session.filledFields);

    const response = await axios.post('https://api.pdf.co/v1/pdf/edit/add', {
      url: session.pdfUrl,
      fields: session.filledFields
    }, {
      headers: { 'x-api-key': PDF_CO_API_KEY, 'Content-Type': 'application/json' }
    });

    if (response.data.success && response.data.url) {
      res.json({ success: true, pdfUrl: response.data.url });
    } else {
      res.status(400).json({ success: false, message: response.data.message || 'Fehler beim Ausfüllen' });
    }
  } catch (error) {
    console.error('[FILL] 💥 Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler beim Ausfüllen: ' + error.message });
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
  console.log(`\n🚀 Server gestartet auf Port ${PORT}`);
  console.log(`📡 API Endpoints bereit unter /api/*`);
  console.log(`🔑 PDF.co API: ${PDF_CO_API_KEY ? '✅ Verbunden' : '❌ Fehlend'}`);
  console.log(`🤖 Comet/Kimi API: ${COMET_KEY ? '✅ Verbunden' : '❌ Fehlend'}`);
  console.log(`🧠 Model: ${MODEL_NAME}`);
});

// ============================================
// 🎯 SPA-FALLBACK
// ============================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 📋 FEHLERBEHANDLUNG
// ============================================
app.use((err, req, res, next) => {
  console.error('\n[ERROR] 💥 Unbehandelter Fehler:', err.message);
  res.status(500).json({ success: false, message: 'Interner Server Fehler: ' + err.message });
});

module.exports = app;
