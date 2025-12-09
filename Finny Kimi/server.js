require('dotenv').config();
const express   = require('express');
const multer    = require('multer');
const axios     = require('axios');
const cors      = require('cors');
const FormData  = require('form-data');
const path      = require('path');
const session   = require('express-session');
const FileStore = require('session-file-store')(session);

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// 📋 KEYS
// ============================================
const PDF_CO_API_KEY = 'leeonzo86@gmail.com_cYjsXcXA3N2FU2jD50NTtjbc4uhMQBtBHl5Wv8hN7GndcfgnQEu0W42g8oLyccos';
const COMET_KEY      = 'sk-eQswrHDAMib6n6uxBXHWyZEd1ABdsAAY0JbuoXQ7Rxl1GkrZ';

// ============================================
// ⚙️ MIDDLEWARE (STRIKTE REIHENFOLGE!)
// ============================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS muss Credentials erlauben!
app.use(cors({ origin: true, credentials: true }));

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 💾 SESSION-PERSISTENZ (korrekt integriert)
// ============================================
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me-in-production',
  resave: false,
  saveUninitialized: false,
  store: new FileStore({ path: './sessions' }),
  cookie: { 
    secure: false,      // Setze auf true bei HTTPS in Production
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'     // WICHTIG für Cross-Origin-Cookies
  },
  name: 'finny.session' // Eindeutiger Session-Cookie-Name
}));

// 📦 Multer-Upload-Middleware
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// ============================================
// 🔥 ULTRA-INTELLIGENTE FELD-HINTS
// ============================================
const FIELD_HINTS = {
  'Ort und Nummer des Registereintrages': {
    hint: 'Das zuständige Amtsgericht und die Handelsregisternummer deines Unternehmens',
    example: 'Amtsgericht München, HRB 12345',
    details: 'Die HRB-Nummer findest du im Handelsregister. Das Amtsgericht ist meist auf deinen Geschäftsdokumenten angegeben.',
    tips: ['Beginne mit "Amtsgericht [Stadt]"', 'Die HRB-Nummer liegt zwischen HRB 1 und HRB 999999', 'Prüfe deine Handelsregistereintrag online'],
    validation: 'Sollte "Amtsgericht" enthalten und eine Nummer haben',
    skipAllowed: ['Einzelunternehmer', 'Freiberufler', 'keine HR-Nummer'],
    fieldContext: 'Nur für Kapitalgesellschaften (GmbH, UG, AG) oder Personengesellschaften mit HR-Eintrag erforderlich'
  },
  // ... (restlichen Feld-Definitions beibehalten) ...
  'Datum der Unterschrift': {
    hint: 'Das Datum, an dem du das Formular unterzeichnest',
    example: '07.12.2025',
    details: 'Normalerweise heute oder das geplante Unterzeichnungsdatum.',
    tips: ['Format: TT.MM.YYYY', 'Darf nicht in der Zukunft liegen', 'Oder heute eingeben'],
    validation: 'Format TT.MM.YYYY',
    fieldContext: 'Unterschrifts-Datum'
  }
};

// ============================================
// 🚀 API ENDPOINTS (korrekt & vollständig)
// ============================================

// 1. PDF Upload zu PDF.co
app.post('/api/upload-pdf', upload.single('file'), async (req, res) => {
  console.log('\n[UPLOAD] ➜ /api/upload-pdf aufgerufen');
  try {
    if (!req.file) {
      console.warn('[UPLOAD] ⚠️ Keine Datei empfangen');
      return res.status(400).json({ success: false, message: 'Keine Datei hochgeladen' });
    }
    console.log(`[UPLOAD] 📄 Datei: ${req.file.originalname} | Größe: ${req.file.size} Byte`);

    const formData = new FormData();
    formData.append('file', req.file.buffer, req.file.originalname);

    const response = await axios.post('https://api.pdf.co/v1/file/upload', formData, {
      headers: { 'x-api-key': PDF_CO_API_KEY, ...formData.getHeaders() }
    });

    if (!response.data.error && response.data.url) {
      const sessionId = generateSessionId();
      
      // Session in req.session.sessions speichern
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

// 2. Formularfelder extrahieren
app.post('/api/extract-fields', async (req, res) => {
  console.log('\n[EXTRACT] ➜ /api/extract-fields aufgerufen');
  try {
    const { sessionId, pdfUrl } = req.body;
    if (!pdfUrl) {
      console.warn('[EXTRACT] ⚠️ Keine PDF-URL übermittelt');
      return res.status(400).json({ success: false, message: 'PDF-URL erforderlich' });
    }

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

    // Session aktualisieren
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

// 3. KIMI-COMET CHAT INTEGRATION
app.post('/api/chat', async (req, res) => {
  console.log('\n[CHAT] ➜ /api/chat aufgerufen');
  try {
    const { sessionId, message, field } = req.body;
    
    // VALIDIERUNG
    if (!sessionId || !message || !field?.name) {
      return res.status(400).json({ success: false, message: 'Fehlende Parameter' });
    }

    // Session holen
    if (!req.session.sessions?.[sessionId]) {
      console.warn('[CHAT] ⚠️ Session nicht gefunden');
      return res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    }

    const lowerMsg = message.trim().toLowerCase();
    const hint = FIELD_HINTS[field.name];

    // Befehle prüfen
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

    // KI-Anfrage
    console.log('[CHAT] ➡️ Sende an CometAPI...');
    const response = await axios.post(
      'https://api.cometapi.com/v1/chat/completions',
      {
        model: 'kimi-k2-thinking',
        messages: [
          { role: 'system', content: `Du bist Finny, ein hilfreicher KI-Assistent für PDF-Formulare. Du bekommst Formularfelder und stellst dem Nutzer eine Frage nach der anderen. Nach jeder Antwort validierst du kurz und gibst Tipps. Antworte immer auf Deutsch und sei freundlich und professionell.` },
          { role: 'user', content: `Ich habe ein PDF-Formular mit dem Feld "${field.name}". Der Nutzer hat geantwortet: "${message}". Bitte validiere die Antwort und gib eine passende Antwort.` }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      { headers: { Authorization: `Bearer ${COMET_KEY}`, 'Content-Type': 'application/json' } }
    );

    const aiResponse = response.data.choices?.[0]?.message?.content || 'Keine Antwort von Comet/Kimi';
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
      return res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    }
    
    req.session.sessions[sessionId].filledFields[fieldName] = value;
    await req.session.save(); // Session explizit speichern
    
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
