# 🚀 Netlify Deployment Guide - Finny PDF Assistant

## WICHTIG: Serverbasierte Lösung!

Diese Version von Finny verwendet einen **Node.js Server** für die API-Verarbeitung. Da Netlify **keine Node.js Server** hostet, benötigen Sie eine Alternative.

## 🔧 Schnelle Lösung: Render.com (Kostenlos)

### Schritt 1: Code vorbereiten
1. Alle Dateien in einem Git-Repository speichern
2. API-Keys in `server.js` überprüfen (sind bereits eingefügt)

### Schritt 2: Auf Render.com deployen
1. Gehe zu [render.com](https://render.com)
2. Anmelden und "New Web Service" erstellen
3. Git-Repository verbinden
4. Einstellungen:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Port**: 3001 (oder Auto)

### Schritt 3: Umgebungsvariablen (Optional)
Füge in Render unter "Environment Variables" hinzu:
```
PDF_CO_API_KEY=leeonzo86@gmail.com_cYjsXcXA3N2FU2jD50NTtjbc4uhMQBtBHl5Wv8hN7GndcfgnQEu0W42g8oLyccos
KIMI_API_KEY=sk-YlbbxvX1FBEzvFh2XiXGmrC1GoqESUPtXD9bJaypAowjtxHo
```

## 🎯 Alternative: Cyclic.sh (Schnell & Kostenlos)

1. Gehe zu [cyclic.sh](https://cyclic.sh)
2. GitHub-Repository verbinden
3. Automatisch deployen
4. Fertig!

## 📋 Lokale Entwicklung

```bash
# Repository klonnen
git clone [dein-repo-url]
cd finny-pdf-assistant

# Dependencies installieren
npm install

# Server starten
npm start

# App öffnen
http://localhost:3001
```

## 🔍 API-Key Positionen im Code

### Server.js (Zeile 20-21):
```javascript
const PDF_CO_API_KEY = 'leeonzo86@gmail.com_cYjsXcXA3N2FU2jD50NTtjbc4uhMQBtBHl5Wv8hN7GndcfgnQEu0W42g8oLyccos';
const KIMI_API_KEY = 'sk-YlbbxvX1FBEzvFh2XiXGmrC1GoqESUPtXD9bJaypAowjtxHo';
```

## 🎨 Design-Features

- **Dunkles Orange-Theme** wie im Original
- **Animierte Live-Uhr** im Header
- **Fortschrittsbalken** mit Animationen
- **Responsive Design** für alle Geräte
- **KI-Chat-Integration** mit KIMI
- **Echtzeit-Validierung** von E-Mails und Daten

## 🛠️ Technische Details

- **Backend**: Node.js + Express
- **File Upload**: Multer (bis 25MB)
- **APIs**: PDF.co + KIMI AI
- **Session Management**: In-Memory (für Tests)
- **CORS**: Aktiviert für alle Origins

## 📁 Dateistruktur
```
/
├── server.js          # Hauptserver-Datei
├── index.html         # Frontend (automatisch serviert)
├── package.json       # Node.js Dependencies
├── fox-logo.png       # Logo
└── README.md          # Dokumentation
```

## 🚨 Wichtige Hinweise

1. **API-Keys** sind für Tests eingebaut - für Produktion sicher speichern!
2. **Session-Daten** werden im Speicher gehalten - für Produktion Datenbank verwenden
3. **File Upload** bis 25MB unterstützt
4. **CORS** für alle Origins aktiviert (für Tests)

## 🎯 Nächste Schritte

1. **Deployen** auf Render.com oder Cyclic.sh
2. **URL kopieren** (z.B. https://finny-app.onrender.com)
3. **PDF hochladen** und testen!

## 📞 Support

Bei Problemen:
1. API-Keys in `server.js` überprüfen
2. Server-Logs auf Hosting-Plattform prüfen
3. CORS-Einstellungen kontrollieren

**Erfolg!** 🦊✨