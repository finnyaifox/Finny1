// Finny PDF Assistant - Main JavaScript
class FinnyPDFAssistant {
    constructor() {
        // API Keys (für Testzwecke - später sicher speichern)
        this.PDFCO_API_KEY = 'leeonzo86@gmail.com_cYjsXcXA3N2FU2jD50NTtjbc4uhMQBtBHl5Wv8hN7GndcfgnQEu0W42g8oLyccos';
        this.KIMI_API_KEY = 'sk-YlbbxvX1FBEzvFh2XiXGmrC1GoqESUPtXD9bJaypAowjtxHo';
        
        // Zustandsvariablen
        this.currentPdfUrl = null;
        this.formFields = [];
        this.filledFields = {};
        this.currentFieldIndex = 0;
        this.isProcessing = false;
        
        // DOM-Elemente
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.uploadStatus = document.getElementById('uploadStatus');
        this.workspace = document.getElementById('workspace');
        this.fieldList = document.getElementById('fieldList');
        this.filledCount = document.getElementById('filledCount');
        this.totalCount = document.getElementById('totalCount');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        this.previewSection = document.getElementById('previewSection');
        this.pdfPreview = document.getElementById('pdfPreview');
        this.downloadPopup = document.getElementById('downloadPopup');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorOverlay = document.getElementById('errorOverlay');
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Upload-Event Listener
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Drag & Drop
        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        
        // Chat-Event Listener
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Button-Event Listener
        document.getElementById('refreshPreview')?.addEventListener('click', () => this.refreshPreview());
        document.getElementById('downloadPdf')?.addEventListener('click', () => this.downloadPdf());
        document.getElementById('downloadFinalPdf')?.addEventListener('click', () => this.downloadFinalPdf());
        document.getElementById('newPdf')?.addEventListener('click', () => this.startNewPDF());
        document.getElementById('editAgain')?.addEventListener('click', () => this.closePopup());
        document.getElementById('closeError')?.addEventListener('click', () => this.closeError());
    }

    // Upload-Funktionalität
    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type === 'application/pdf') {
            this.processFile(files[0]);
        } else {
            this.showError('Bitte laden Sie nur PDF-Dateien hoch.');
        }
    }

    handleFileUpload(e) {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            this.processFile(file);
        } else {
            this.showError('Bitte laden Sie nur PDF-Dateien hoch.');
        }
    }

    async processFile(file) {
        this.showLoading('PDF wird hochgeladen...');
        
        try {
            // Schritt 1: PDF zu PDF.co hochladen
            const pdfUrl = await this.uploadToPdfCo(file);
            this.currentPdfUrl = pdfUrl;
            
            // Schritt 2: Formularfelder extrahieren
            const fields = await this.extractFormFields(pdfUrl);
            
            if (fields.length === 0) {
                throw new Error('Keine Formularfelder im PDF gefunden.');
            }
            
            this.formFields = fields;
            this.showUploadSuccess();
            this.setupWorkspace();
            
        } catch (error) {
            this.showError(`Fehler beim Verarbeiten der PDF: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    async uploadToPdfCo(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('https://api.pdf.co/v1/file/upload', {
            method: 'POST',
            headers: {
                'x-api-key': this.PDFCO_API_KEY
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Upload zu PDF.co fehlgeschlagen');
        }
        
        const result = await response.json();
        
        if (!result.success || !result.url) {
            throw new Error(result.message || 'Unbekannter Fehler beim Upload');
        }
        
        return result.url;
    }

    async extractFormFields(pdfUrl) {
        const response = await fetch('https://api.pdf.co/v1/pdf/info/fields', {
            method: 'POST',
            headers: {
                'x-api-key': this.PDFCO_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: pdfUrl
            })
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Extrahieren der Formularfelder');
        }
        
        const result = await response.json();
        
        if (!result.success || !result.fields) {
            throw new Error(result.message || 'Keine Felder gefunden');
        }
        
        return result.fields.map(field => ({
            name: field.fieldName || field.name,
            type: field.fieldType || 'text',
            value: ''
        }));
    }

    showUploadSuccess() {
        this.uploadStatus.style.display = 'block';
        setTimeout(() => {
            this.uploadStatus.style.display = 'none';
        }, 3000);
    }

    setupWorkspace() {
        // Upload-Bereich ausblenden, Workspace anzeigen
        document.getElementById('uploadSection').style.display = 'none';
        this.workspace.style.display = 'block';
        
        // Sidebar aktualisieren
        this.updateFieldList();
        
        // Chat aktivieren
        this.chatInput.disabled = false;
        this.sendButton.disabled = false;
        
        // Erste Frage stellen
        this.startChatInteraction();
    }

    updateFieldList() {
        this.fieldList.innerHTML = '';
        this.totalCount.textContent = this.formFields.length;
        this.filledCount.textContent = Object.keys(this.filledFields).length;
        
        this.formFields.forEach((field, index) => {
            const fieldItem = document.createElement('div');
            fieldItem.className = `field-item ${this.filledFields[field.name] ? 'filled' : ''}`;
            
            fieldItem.innerHTML = `
                <span class="field-name">${field.name}</span>
                <div class="field-status">
                    <span class="status-indicator ${this.filledFields[field.name] ? 'filled' : ''}"></span>
                    <span class="edit-icon" onclick="finny.editField('${field.name}')">✎</span>
                </div>
            `;
            
            this.fieldList.appendChild(fieldItem);
        });
    }

    // Chat-Funktionalität
    startChatInteraction() {
        if (this.currentFieldIndex >= this.formFields.length) {
            this.completeForm();
            return;
        }
        
        const currentField = this.formFields[this.currentFieldIndex];
        const question = this.generateQuestion(currentField);
        
        this.addBotMessage(question);
    }

    generateQuestion(field) {
        const fieldName = field.name.toLowerCase();
        
        if (fieldName.includes('vorname') || fieldName.includes('first_name')) {
            return `Bitte geben Sie Ihren Vornamen ein:`;
        } else if (fieldName.includes('nachname') || fieldName.includes('last_name')) {
            return `Bitte geben Sie Ihren Nachnamen ein:`;
        } else if (fieldName.includes('email') || fieldName.includes('e-mail')) {
            return `Bitte geben Sie Ihre E-Mail-Adresse ein:`;
        } else if (fieldName.includes('telefon') || fieldName.includes('phone')) {
            return `Bitte geben Sie Ihre Telefonnummer ein:`;
        } else if (fieldName.includes('adresse') || fieldName.includes('address')) {
            return `Bitte geben Sie Ihre Adresse ein:`;
        } else if (fieldName.includes('geburtsdatum') || fieldName.includes('birth')) {
            return `Bitte geben Sie Ihr Geburtsdatum ein (TT.MM.JJJJ):`;
        } else {
            return `Bitte geben Sie einen Wert für "${field.name}" ein:`;
        }
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || this.isProcessing) return;
        
        this.isProcessing = true;
        this.addUserMessage(message);
        this.chatInput.value = '';
        
        try {
            // Antwort validieren und speichern
            const currentField = this.formFields[this.currentFieldIndex];
            const validatedValue = await this.validateAndProcessAnswer(message, currentField);
            
            if (validatedValue) {
                this.filledFields[currentField.name] = validatedValue;
                this.updateFieldList();
                this.currentFieldIndex++;
                
                setTimeout(() => {
                    this.startChatInteraction();
                }, 1000);
            } else {
                this.addBotMessage(`Entschuldigung, ich konnte Ihre Eingabe nicht verstehen. Bitte versuchen Sie es erneut.`);
            }
            
        } catch (error) {
            this.addBotMessage(`Entschuldigung, es gab einen Fehler bei der Verarbeitung. Bitte versuchen Sie es erneut.`);
        } finally {
            this.isProcessing = false;
        }
    }

    async validateAndProcessAnswer(answer, field) {
        // Hier könnte man komplexere Validierung mit Kimi durchführen
        // Für jetzt einfache Validierung
        
        const fieldName = field.name.toLowerCase();
        
        // Email-Validierung
        if (fieldName.includes('email')) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(answer)) {
                this.addBotMessage(`Das sieht nicht wie eine gültige E-Mail-Adresse aus. Bitte geben Sie eine gültige E-Mail-Adresse ein (z.B. max@example.com):`);
                return null;
            }
        }
        
        // Datum-Validierung
        if (fieldName.includes('datum') || fieldName.includes('date') || fieldName.includes('geburts')) {
            // Versuche verschiedene Datumsformate zu erkennen und zu normalisieren
            const answerClean = answer.trim();
            
            // Deutsche Format: TT.MM.JJJJ
            const germanDateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
            if (germanDateRegex.test(answerClean)) {
                const match = answerClean.match(germanDateRegex);
                const day = parseInt(match[1]);
                const month = parseInt(match[2]);
                const year = parseInt(match[3]);
                
                // Validiere Datum
                const date = new Date(year, month - 1, day);
                if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                    // Format normalisieren
                    const normalizedDay = day.toString().padStart(2, '0');
                    const normalizedMonth = month.toString().padStart(2, '0');
                    return `${normalizedDay}.${normalizedMonth}.${year}`;
                }
            }
            
            // ISO Format: YYYY-MM-DD
            const isoDateRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
            if (isoDateRegex.test(answerClean)) {
                const match = answerClean.match(isoDateRegex);
                const year = parseInt(match[1]);
                const month = parseInt(match[2]);
                const day = parseInt(match[3]);
                
                const date = new Date(year, month - 1, day);
                if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                    // Konvertiere zu deutschem Format
                    const germanDay = day.toString().padStart(2, '0');
                    const germanMonth = month.toString().padStart(2, '0');
                    return `${germanDay}.${germanMonth}.${year}`;
                }
            }
            
            // Wenn kein gültiges Format erkannt wurde
            this.addBotMessage(`Bitte geben Sie das Datum im Format TT.MM.JJJJ ein (z.B. 15.03.1990):`);
            return null;
        }
        
        return answer;
    }

    addBotMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message bot-message';
        messageElement.innerHTML = `
            <div class="message-avatar">🦊</div>
            <div class="message-content">
                <p>${message}</p>
            </div>
        `;
        
        this.chatMessages.appendChild(messageElement);
        this.scrollToBottom();
    }

    addUserMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message user-message';
        messageElement.innerHTML = `
            <div class="message-avatar">👤</div>
            <div class="message-content">
                <p>${message}</p>
            </div>
        `;
        
        this.chatMessages.appendChild(messageElement);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    editField(fieldName) {
        // Feld bearbeiten - zurück zu diesem Feld gehen
        const fieldIndex = this.formFields.findIndex(f => f.name === fieldName);
        if (fieldIndex !== -1) {
            this.currentFieldIndex = fieldIndex;
            delete this.filledFields[fieldName];
            this.updateFieldList();
            this.startChatInteraction();
        }
    }

    async completeForm() {
        this.showLoading('PDF wird verarbeitet...');
        
        try {
            // PDF mit den gesammelten Daten ausfüllen
            const filledPdfUrl = await this.fillPdfForm();
            
            // Vorschau anzeigen
            this.showPreview(filledPdfUrl);
            
            // Download-Popup anzeigen
            this.showDownloadPopup(filledPdfUrl);
            
        } catch (error) {
            this.showError(`Fehler beim Ausfüllen des PDFs: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    async fillPdfForm() {
        const response = await fetch('https://api.pdf.co/v1/pdf/edit/add', {
            method: 'POST',
            headers: {
                'x-api-key': this.PDFCO_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: this.currentPdfUrl,
                fields: this.filledFields
            })
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Ausfüllen des PDFs');
        }
        
        const result = await response.json();
        
        if (!result.success || !result.url) {
            throw new Error(result.message || 'Unbekannter Fehler beim Ausfüllen');
        }
        
        return result.url;
    }

    showPreview(pdfUrl) {
        this.previewSection.style.display = 'block';
        this.pdfPreview.src = pdfUrl;
    }

    showDownloadPopup(pdfUrl) {
        this.downloadPopup.style.display = 'flex';
        this.downloadPopup.dataset.pdfUrl = pdfUrl;
    }

    closePopup() {
        this.downloadPopup.style.display = 'none';
    }

    async refreshPreview() {
        if (this.pdfPreview.src) {
            this.pdfPreview.src = this.pdfPreview.src + '?t=' + Date.now();
        }
    }

    downloadPdf() {
        if (this.pdfPreview.src) {
            const link = document.createElement('a');
            link.href = this.pdfPreview.src;
            link.download = 'ausgefuellt.pdf';
            link.click();
        }
    }

    downloadFinalPdf() {
        const pdfUrl = this.downloadPopup.dataset.pdfUrl;
        if (pdfUrl) {
            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = 'ausgefuellt.pdf';
            link.click();
        }
    }

    startNewPDF() {
        // Alles zurücksetzen
        this.currentPdfUrl = null;
        this.formFields = [];
        this.filledFields = {};
        this.currentFieldIndex = 0;
        
        // UI zurücksetzen
        this.workspace.style.display = 'none';
        this.previewSection.style.display = 'none';
        document.getElementById('uploadSection').style.display = 'flex';
        this.downloadPopup.style.display = 'none';
        
        // Chat zurücksetzen
        this.chatMessages.innerHTML = `
            <div class="message bot-message">
                <div class="message-avatar">🦊</div>
                <div class="message-content">
                    <p>Hallo! Ich bin Finny und helfe Ihnen dabei, Ihr PDF-Formular auszufüllen. 
                    Sobald Sie ein PDF hochgeladen haben, werde ich Ihnen Fragen zu den einzelnen Feldern stellen.</p>
                </div>
            </div>
        `;
        
        this.chatInput.disabled = true;
        this.sendButton.disabled = true;
        
        // File-Input zurücksetzen
        this.fileInput.value = '';
    }

    // Utility-Funktionen
    showLoading(message = 'Laden...') {
        this.loadingOverlay.querySelector('p').textContent = message;
        this.loadingOverlay.style.display = 'flex';
    }

    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        this.errorOverlay.style.display = 'flex';
    }

    closeError() {
        this.errorOverlay.style.display = 'none';
    }
}

// Globale Funktionen für HTML-Event-Handler
function editField(fieldName) {
    if (window.finny) {
        window.finny.editField(fieldName);
    }
}

// Initialisierung wenn DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
    window.finny = new FinnyPDFAssistant();
    
    // Scroll-Animationen für bessere UX
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Beobachte Elemente für Scroll-Animationen
    document.querySelectorAll('.upload-area, .workspace-container > *').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});