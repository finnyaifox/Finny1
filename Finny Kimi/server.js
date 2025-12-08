require('dotenv').config();
const express   = require('express');
const multer    = require('multer');
const axios     = require('axios');
const cors      = require('cors');
const FormData  = require('form-data');
const path      = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// 📋 KEYS
// ============================================
const PDF_CO_API_KEY = 'leeonzo86@gmail.com_cYjsXcXA3N2FU2jD50NTtjbc4uhMQBtBHl5Wv8hN7GndcfgnQEu0W42g8oLyccos';   // ← eigenen Key einsetzen!
const COMET_KEY      = 'sk-eQswrHDAMib6n6uxBXHWyZEd1ABdsAAY0JbuoXQ7Rxl1GkrZ';

// ============================================
// ⚙️ MIDDLEWARE
// ============================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 📦 Multer-Upload-Middleware
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

// ============================================
// 💾 SESSIONS & ULTRA-INTELLIGENTE HINTS
// ============================================
const sessions = new Map();

// 🔥 ULTRA-INTELLIGENTE FELD-HINTS MIT KONTEXT
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
  'Eingetragener Name mit Rechtsform': {
    hint: 'Der offizielle Unternehmensname mit Rechtsform (GmbH, UG, AG, KG, etc.)',
    example: 'Müller & Partner GmbH',
    details: 'Das ist der Name, der im Handelsregister eingetragen ist - nicht der Geschäftsname.',
    tips: ['Muss die Rechtsform enthalten (z.B. GmbH, UG, AG)', 'Nutze die exakte Schreibweise aus deinem Handelsregister', 'Keine Sonderzeichen oder Umlaute vergessen'],
    validation: 'Sollte Unternehmensname + Rechtsform sein',
    fieldContext: 'Der formale Name deines Unternehmens'
  },
  'Name des Geschäfts': {
    hint: 'Der Geschäfts- oder Handelsname deines Unternehmens',
    example: 'Müllers Online-Shop',
    details: 'Der Name, unter dem dein Unternehmen tätig ist - kann anders als der offizielle Name sein.',
    tips: ['Kann identisch mit dem eingetragenen Namen sein', 'Oder ein Zusatzname wie "doing business as"', 'Dies ist der Name, den deine Kunden kennen'],
    validation: 'Der geschäftliche Name des Unternehmens',
    fieldContext: 'Der Name, unter dem die Geschäftstätigkeit ausgeübt wird'
  },
  'Familienname': {
    hint: 'Dein Nachname',
    example: 'Müller',
    details: 'Der Familienname, wie er in deinem Ausweis steht.',
    tips: ['Keine Vornamen hinzufügen', 'Umlaute und Sonderzeichen korrekt eingeben', 'Falls verheiratet: deinen aktuellen Namen verwenden'],
    validation: 'Nur Buchstaben, Umlaute erlaubt',
    fieldContext: 'Persönlicher Familienname des Antragstellers'
  },
  'Vorname': {
    hint: 'Dein Vorname (alle Vornamen)',
    example: 'Max Heinrich',
    details: 'Wenn du mehrere Vornamen hast, trage alle ein.',
    tips: ['Alle Vornamen eintragen', 'Groß- und Kleinschreibung beachten', 'Genau wie im Ausweis'],
    validation: 'Nur Buchstaben',
    fieldContext: 'Vollständiger Vorname des Antragstellers'
  },
  'Geburtsdatum': {
    hint: 'Dein Geburtsdatum im Format TT.MM.YYYY',
    example: '15.03.1985',
    details: 'Tag.Monat.Jahr - nicht YYYY-MM-DD oder andere Formate!',
    tips: ['Format: TT.MM.YYYY (z.B. 05.09.1990)', 'Monat muss 01-12 sein', 'Tag muss 01-31 sein (je nach Monat)'],
    validation: 'Muss dem Format TT.MM.YYYY entsprechen',
    fieldContext: 'Geburtsdatum des Antragstellers'
  },
  'Anschrift der Wohnung': {
    hint: 'Deine private Adresse (Straße, Hausnummer, PLZ, Stadt)',
    example: 'Musterstraße 42, 80331 München',
    details: 'Die Adresse aus deinem Ausweis oder aktuellem Wohnort.',
    tips: ['Vollständige Straßenadresse mit Hausnummer', 'Fünfstellige Postleitzahl', 'Ort / Stadt vollständig', 'Mit Komma trennen: Straße, PLZ Ort'],
    validation: 'Straße + Nummer, PLZ + Ort erforderlich',
    fieldContext: 'Wohnanschrift des Antragstellers'
  },
  'Telefon': {
    hint: 'Deine Telefonnummer (mit Vorwahl)',
    example: '+49 89 123456 oder 089 123456',
    details: 'Eine Nummer, unter der du erreichbar bist.',
    tips: ['+49 für Deutschland', 'Oder 0 mit Vorwahl', 'Leerzeichen und Bindestriche ok', 'Mindestens 6 Ziffern'],
    validation: 'Mit Vorwahl, mind. 6 Ziffern',
    fieldContext: 'Kontakt-Telefonnummer'
  },
  'Telefax': {
    hint: 'Deine Faxnummer (optional)',
    example: '+49 89 654321',
    details: 'Falls vorhanden - sonst "Keine" oder "-" eingeben.',
    tips: ['Gleiche Regeln wie Telefon', 'Oder "keine" / "-" falls nicht vorhanden'],
    validation: 'Gleich wie Telefonnummer oder leerlassen',
    skipAllowed: ['keine', '-', 'nicht vorhanden'],
    fieldContext: 'Faxnummer (optional)'
  },
  'E-Mail/Web (freiwillig)': {
    hint: 'Deine E-Mail-Adresse oder Website',
    example: 'max.mueller@beispiel.de oder www.beispiel.de',
    details: 'Freiwillig - kann auch leergelassen werden.',
    tips: ['Gültige E-Mail Format: name@domain.de', 'Oder Website: www.example.com', 'Falls nicht vorhanden: "-" eingeben'],
    validation: 'Gültige E-Mail oder Website oder "-"',
    skipAllowed: ['-', 'keine', 'nicht vorhanden'],
    fieldContext: 'Kontaktinformation (optional)'
  },
  'Angemeldete Tätigkeit': {
    hint: 'Beschreibe kurz was dein Unternehmen tut',
    example: 'Online-Handel mit Elektronik und Zubehör',
    details: 'Eine kurze, präzise Beschreibung deiner Geschäftstätigkeit.',
    tips: ['2-3 Sätze reichen', 'Seiverkaufte Produkte / Dienstleistungen nennen', 'z.B. "Beratung und Vertrieb von Software"', 'Sei spezifisch, nicht zu allgemein'],
    validation: 'Kurze, präzise Beschreibung (mind. 5 Wörter)',
    fieldContext: 'Beschreibung der Geschäftstätigkeit'
  },
  'Beginn der angemeldeten Tätigkeit': {
    hint: 'Das Startdatum deiner Geschäftstätigkeit (TT.MM.YYYY)',
    example: '01.01.2024',
    details: 'Der Tag, an dem du mit der Tätigkeit begonnen hast.',
    tips: ['Format: TT.MM.YYYY', 'Kann heute sein oder in der Zukunft', 'Rückwirkend möglich: bis 3 Monate zurück'],
    validation: 'Format TT.MM.YYYY',
    fieldContext: 'Startdatum der Tätigkeit'
  },
  'Anschrift der Betriebsstätte': {
    hint: 'Die Adresse deines Geschäfts (falls unterschiedlich von Privatadresse)',
    example: 'Gewerbestraße 12, 80331 München',
    details: 'Kann identisch mit Wohnadresse sein.',
    tips: ['Gleiche Regeln wie Wohnadresse', 'Wenn Privatadresse = Betriebsadresse: gleich eintragen', 'Miete, Eigentum - beide ok'],
    validation: 'Vollständige Adresse oder "siehe Wohnadresse"',
    fieldContext: 'Betriebsstätten-Adresse'
  },
  'Zahl Vollzeit': {
    hint: 'Wie viele Vollzeitbeschäftigte hat dein Unternehmen?',
    example: '3',
    details: 'Nur die Anzahl eingeben - keine Zahl 0 oder "keine".',
    tips: ['Nur Zahl eingeben: 0, 1, 2, 3...', 'Du selbst zählst mit, falls angestellt', 'Minijobbis zählen nicht'],
    validation: 'Nur Zahlen 0-999',
    skipAllowed: ['0', 'keine'],
    fieldContext: 'Anzahl der Vollzeitbeschäftigten'
  },
  'Zahl Teilzeit': {
    hint: 'Wie viele Teilzeitbeschäftigte hat dein Unternehmen?',
    example: '2',
    details: 'Die Anzahl der Teilzeitbeschäftigten.',
    tips: ['Nur Zahl eingeben', 'Kann auch 0 sein', 'Du selbst zählst mit'],
    validation: 'Nur Zahlen 0-999',
    skipAllowed: ['0', 'keine'],
    fieldContext: 'Anzahl der Teilzeitbeschäftigten'
  },
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
// 🚀 API ENDPOINTS  (mit  D E T A I L  L O G S)
// ============================================

// 1. PDF Upload zu PDF.co
app.post('/api/upload-pdf', upload.single('file'), async (req, res) => {
  console.log('\n[UPLOAD]  ➜  /api/upload-pdf aufgerufen');
  try {
    if (!req.file) {
      console.warn('[UPLOAD]  ⚠️  Keine Datei empfangen');
      return res.status(400).json({ success: false, message: 'Keine Datei hochgeladen' });
    }
    console.log(`[UPLOAD]  📄  Datei empfangen: ${req.file.originalname} | Größe: ${req.file.size} Byte`);

    const formData = new FormData();
    formData.append('file', req.file.buffer, req.file.originalname);
    console.log('[UPLOAD]  ⬆️   Sende Datei zu PDF.co ...');

    const response = await axios.post('https://api.pdf.co/v1/file/upload', formData, {
      headers: { 'x-api-key': PDF_CO_API_KEY, ...formData.getHeaders() }
    });

    console.log('[UPLOAD]  ✅  PDF.co Antwort erhalten:', response.data);

    if (!response.data.error && response.data.url) {
      const sessionId = generateSessionId();
      sessions.set(sessionId, { pdfUrl: response.data.url, fields: [], filledFields: {}, currentFieldIndex: 0 });
      console.log(`[UPLOAD]  📦  Session erstellt: ${sessionId}`);
      res.json({ success: true, sessionId: sessionId, pdfUrl: response.data.url });
    } else {
      console.error('[UPLOAD]  ❌  PDF.co Fehler:', response.data.message);
      res.status(400).json({ success: false, message: response.data.message || 'Upload fehlgeschlagen' });
    }
  } catch (error) {
    console.error('[UPLOAD]  💥  Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler beim Upload: ' + error.message });
  }
});

// 2. Formularfelder extrahieren
app.post('/api/extract-fields', async (req, res) => {
  console.log('\n[EXTRACT] ➜  /api/extract-fields aufgerufen');
  try {
    const { sessionId, pdfUrl } = req.body;
    console.log(`[EXTRACT] 📄  PDF-URL: ${pdfUrl}`);
    if (!pdfUrl) {
      console.warn('[EXTRACT] ⚠️  Keine PDF-URL übermittelt');
      return res.status(400).json({ success: false, message: 'PDF-URL erforderlich' });
    }

    console.log('[EXTRACT] 🔍  Frage Formularfelder bei PDF.co an ...');
    const response = await axios.post('https://api.pdf.co/v1/pdf/info/fields', { url: pdfUrl }, {
      headers: { 'x-api-key': PDF_CO_API_KEY, 'Content-Type': 'application/json' }
    });

    console.log('[EXTRACT] ✅  PDF.co Antwort erhalten');

    // KORREKT: Datenstruktur ist response.data.info.FieldsInfo.Fields
    const rawFields = response.data.info?.FieldsInfo?.Fields || [];
    
    if (rawFields.length === 0) {
      console.warn('[EXTRACT] ⚠️  Keine Formularfelder gefunden');
      return res.status(400).json({ success: false, message: 'Keine Formularfelder in dieser PDF gefunden' });
    }

    const fields = rawFields.map(f => ({
      name: f.FieldName || f.fieldName || f.name,
      type: f.Type || f.type || 'text',
      value: ''
    }));

    if (sessions.has(sessionId)) {
      sessions.get(sessionId).fields = fields;
    }

    console.log(`[EXTRACT] 📋  ${fields.length} Felder gefunden und geparst`);
    res.json({ success: true, fields });

  } catch (error) {
    console.error('[EXTRACT] 💥  Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler beim Extrahieren: ' + error.message });
  }
});

// 3. KIMI-COMET CHAT INTEGRATION  (mit intelligenten Hints)
app.post('/api/chat', async (req, res) => {
  console.log('\n[CHAT]    ➜  /api/chat aufgerufen');
  try {
    const { sessionId, message, field } = req.body;
    console.log(`[CHAT]    💬  Session: ${sessionId} | Feld: ${field.name} | Nutzer: ${message}`);

    if (!sessions.has(sessionId)) {
      console.warn('[CHAT]    ⚠️  Session nicht gefunden');
      return res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    }

    // 1) Prüfe auf intelligente Befehle
    const lowerMsg = message.trim().toLowerCase();
    if (lowerMsg === 'hilfe' || lowerMsg === 'help') {
      const hint = FIELD_HINTS[field.name];
      const reply = hint ? `${hint.hint}\n\nBeispiel: ${hint.example}\n\nDetails: ${hint.details}` : 'Keine weiteren Hinweise vorhanden.';
      console.log('[CHAT]    ℹ️   Befehl "hilfe" erkannt');
      return res.json({ success: true, response: reply });
    }
    if (lowerMsg === 'beispiel' || lowerMsg === 'example') {
      const hint = FIELD_HINTS[field.name];
      const reply = hint ? `Beispiel: ${hint.example}\n\nTips: ${hint.tips.join(', ')}` : 'Kein Beispiel vorhanden.';
      console.log('[CHAT]    ℹ️   Befehl "beispiel" erkannt');
      return res.json({ success: true, response: reply });
    }
    if (['skip', 'weiter', 'überspringen'].includes(lowerMsg)) {
      console.log('[CHAT]    ⏭️   Feld wird übersprungen');
      return res.json({ success: true, response: 'Feld übersprungen', skip: true });
    }

    // 2) Normale KIMI-Validierung / Antwort
    console.log('[CHAT]    ➡️   Sende Anfrage an CometAPI (kimi-k2-thinking) ...');
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

    console.log('[CHAT]    ✅  Comet Antwort:', response.data);
    const aiResponse = response.data.choices?.[0]?.message?.content || 'Keine Antwort von Comet/Kimi';
    res.json({ success: true, response: aiResponse });

  } catch (error) {
    console.error('[CHAT]    💥  Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler bei Comet-API: ' + error.message });
  }
});

// 4. Feld validieren
app.post('/api/validate-field', async (req, res) => {
  console.log('\n[VALID]   ➜  /api/validate-field aufgerufen');
  try {
    const { sessionId, fieldName, value } = req.body;
    console.log(`[VALID]   🧪  Feld: ${fieldName} | Wert: ${value}`);
    // (hier deine bisherige Validierungs-Logik)
    res.json({ success: true, isValid: true, message: '' });
  } catch (error) {
    console.error('[VALID]   💥  Exception:', error.message);
    res.status(500).json({ success: false, message: 'Fehler bei Validierung: ' + error.message });
  }
});

// 5. PDF ausfüllen
app.post('/api/fill-pdf', async (req, res) => {
  console.log('\n[FILL]    ➜  /api/fill-pdf aufgerufen');
  try {
    const { sessionId } = req.body;
    if (!sessions.has(sessionId)) return res.status(400).json({ success: false, message: 'Session nicht gefunden' });
    const session = sessions.get(sessionId);
    console.log(`[FILL]    🖨️   Fülle PDF mit Feldern:`, session.filledFields);

    const response = await axios.post('https://api.pdf.co/v1/pdf/edit/add', {
      url: session.pdfUrl,
      fields: session.filledFields
    }, {
      headers: { 'x-api-key': PDF_CO_API_KEY, 'Content-Type': 'application/json' }
    });

    console.log('[FILL]    ✅  PDF.co Antwort:', response.data);
    if (response.data.success && response.data.url) {
      res.json({ success: true, pdfUrl: response.data.url });
    } else {
      res.status(400).json({ success: false, message: response.data.message || 'Fehler beim Ausfüllen' });
    }
  } catch (error) {
    console.error('[FILL]    💥  Exception:', error.message);
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
// 🎯 SPA-FALLBACK – index.html für alle nicht-API-Routen
// ============================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 📋 FEHLERBEHANDLUNG (MUSS ganz unten stehen)
// ============================================
app.use((err, req, res, next) => {
  console.error('\n[ERROR]   💥  Unbehandelter Fehler:', err.message);
  res.status(500).json({ success: false, message: 'Interner Server Fehler: ' + err.message });
});

module.exports = app;
