/**
 * CounterpointAI - Main Application
 */
class App {
    constructor() {
        this.scoreEditor = null;
        this.playbackEngine = null;
        this.aiAssistant = null;
        this.pdfStatusPollMs = 1000;
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('🔧 Initializing components...');
        
        // Initialize components
        console.log('  Creating ABCScoreEditor...');
        this.scoreEditor = new ABCScoreEditor('osmdContainer');
        
        console.log('  Creating ABCPlayback...');
        this.playbackEngine = new ABCPlayback();
        
        console.log('  Creating ABCAIAssistant...');
        this.aiAssistant = new ABCAIAssistant();

        // Connect components
        console.log('🔗 Connecting components...');
        this.aiAssistant.setScoreEditor(this.scoreEditor);

        // Setup event handlers
        console.log('⚙️ Setting up event handlers...');
        this.setupToolbarHandlers();
        this.setupPlaybackHandlers();
        this.setupChatHandlers();
        this.setupModalHandlers();
        this.setupSidebarHandlers();
        this.setupKeyboardShortcuts();
        
        // Listen for score updates
        window.addEventListener('abcScoreUpdated', (event) => {
            console.log('🎵 Score updated, reinitializing playback...');
            this.reinitializePlayback();
        });

        // Load saved model preference
        this.loadModelPreference();

        // Load theme preference
        this.loadTheme();

        console.log('✅ CounterpointAI initialized successfully');
    }

    /**
     * Setup toolbar button handlers
     */
    setupToolbarHandlers() {
        // New Score
        document.getElementById('newBtn')?.addEventListener('click', () => {
            this.showModal('newScoreModal');
        });
        document.getElementById('newScoreBtn')?.addEventListener('click', () => {
            this.showModal('newScoreModal');
        });

        // Open File
        const fileInput = document.getElementById('fileInput');
        document.getElementById('uploadBtn')?.addEventListener('click', () => {
            fileInput.click();
        });
        document.getElementById('openScoreBtn')?.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.openFile(file);
                fileInput.value = ''; // Reset for next selection
            }
        });

        // Save
        document.getElementById('saveBtn')?.addEventListener('click', () => {
            this.saveScore();
        });

        // Settings
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            this.showModal('settingsModal');
        });
    }

    /**
     * Setup playback control handlers
     */
    setupPlaybackHandlers() {
        const playBtn = document.getElementById('playBtn');
        const stopBtn = document.getElementById('stopBtn');
        const tempoInput = document.getElementById('tempoInput');

        playBtn?.addEventListener('click', async () => {
            if (!this.playbackEngine.synthControl) {
                this.showToast('Load a score first');
                return;
            }
            
            await this.playbackEngine.togglePlay();
            const isPlaying = this.playbackEngine.isPlaying;
            playBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        });

        stopBtn?.addEventListener('click', () => {
            this.playbackEngine.stop();
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
        });

        tempoInput?.addEventListener('change', (e) => {
            const speed = parseFloat(e.target.value) / 100;
            this.playbackEngine.setSpeed(speed);
        });

        forwardBtn?.addEventListener('click', () => {
            this.playbackEngine.forward();
        });

        loopBtn?.addEventListener('click', () => {
            const isLooping = this.playbackEngine.toggleLoop();
            loopBtn.classList.toggle('active', isLooping);
        });

        tempoInput?.addEventListener('change', (e) => {
            const tempo = parseInt(e.target.value);
            this.playbackEngine.setTempo(tempo);
        });

        volumeSlider?.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100;
            this.playbackEngine.setVolume(volume);
        });

        timelineSlider?.addEventListener('input', (e) => {
            const percentage = parseInt(e.target.value);
            const state = this.playbackEngine.getState();
            const time = (percentage / 100) * state.totalDuration;
            this.playbackEngine.seek(time);
        });

        // Time update callback
        let updateCallCount = 0;
        this.playbackEngine.onTimeUpdate = (current, total) => {
            updateCallCount++;
            
            const currentTimeEl = document.getElementById('currentTime');
            const totalTimeEl = document.getElementById('totalTime');
            
            if (currentTimeEl) {
                currentTimeEl.textContent = this.playbackEngine.formatTime(current);
            }
            if (totalTimeEl) {
                totalTimeEl.textContent = this.playbackEngine.formatTime(total);
            }
            
            if (total > 0 && timelineSlider) {
                const percentage = (current / total) * 100;
                timelineSlider.value = percentage;
                
                if (updateCallCount <= 5 || updateCallCount % 30 === 0) {
                    console.log(`⏱️ Timeline callback #${updateCallCount}: ${percentage.toFixed(1)}% (${(current/1000).toFixed(2)}s / ${(total/1000).toFixed(2)}s)`);
                }
            }
        };

        this.playbackEngine.onPlayStateChange = (state) => {
            console.log('▶️ Play state changed:', state);
            if (state === 'stopped') {
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                updateCallCount = 0; // Reset counter
            } else if (state === 'playing') {
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }
        };
    }

    /**
     * Setup chat panel handlers
     */
    setupChatHandlers() {
        const toggleBtn = document.getElementById('toggleChatBtn');
        const chatSidebar = document.getElementById('chatSidebar');
        const modelSelect = document.getElementById('modelSelect');
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');

        // Toggle chat panel
        toggleBtn?.addEventListener('click', () => {
            chatSidebar.classList.toggle('collapsed');
            const icon = toggleBtn.querySelector('i');
            if (chatSidebar.classList.contains('collapsed')) {
                icon.className = 'fas fa-chevron-left';
            } else {
                icon.className = 'fas fa-chevron-right';
            }
        });

        // Update model on change
        modelSelect?.addEventListener('change', () => {
            const model = modelSelect.value;
            this.aiAssistant.setModel(model);
            const modelName = modelSelect.options[modelSelect.selectedIndex].text;
            this.showToast(`Model changed to: ${modelName}`);
        });

        // Send message
        const sendMessage = async () => {
            const message = chatInput.value.trim();
            if (!message) return;

            // Add user message to chat
            this.addChatMessage(message, 'user');
            chatInput.value = '';

            // Show typing indicator
            const typingIndicator = this.showTypingIndicator();

            try {
                const response = await this.aiAssistant.sendMessage(message);
                typingIndicator.remove();
                
                // Add AI response
                const displayMessage = this.aiAssistant.formatResponse(response);
                this.addChatMessage(displayMessage, 'assistant');

                // Show if modifications were applied
                if (response.modifications && response.modifications.length > 0) {
                    this.showToast(`Applied ${response.modifications.length} modification(s)`);
                }
            } catch (error) {
                typingIndicator.remove();
                this.addChatMessage(`Error: ${error.message}`, 'assistant');
            }
        };

        sendBtn?.addEventListener('click', sendMessage);
        chatInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    /**
     * Setup sidebar toggle handlers
     */
    setupSidebarHandlers() {
        const leftSidebar = document.getElementById('leftSidebar');
        const toggleBtn = document.getElementById('toggleLeftSidebar');
        
        toggleBtn?.addEventListener('click', () => {
            leftSidebar.classList.toggle('collapsed');
            const icon = toggleBtn.querySelector('i');
            
            if (leftSidebar.classList.contains('collapsed')) {
                icon.className = 'fas fa-chevron-right';
                toggleBtn.title = 'Show Palette';
            } else {
                icon.className = 'fas fa-chevron-left';
                toggleBtn.title = 'Hide Palette';
            }
        });
    }

    /**
     * Setup modal handlers
     */
    setupModalHandlers() {
        // New Score Modal
        const newScoreModal = document.getElementById('newScoreModal');
        document.getElementById('closeNewScoreModal')?.addEventListener('click', () => {
            this.hideModal('newScoreModal');
        });
        document.getElementById('cancelNewScore')?.addEventListener('click', () => {
            this.hideModal('newScoreModal');
        });
        document.getElementById('createScoreBtn')?.addEventListener('click', () => {
            this.createNewScore();
        });

        // Add instrument button
        document.getElementById('addInstrumentBtn')?.addEventListener('click', () => {
            this.addInstrumentRow();
        });

        // Settings Modal
        document.getElementById('closeSettingsModal')?.addEventListener('click', () => {
            this.hideModal('settingsModal');
        });
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
            this.saveSettings();
        });

        // Theme selector
        document.getElementById('themeSelect')?.addEventListener('change', (e) => {
            this.setTheme(e.target.value);
        });

        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    /**
     * Setup note/rest palette handlers
     */
    setupPaletteHandlers() {
        // Note buttons
        document.querySelectorAll('.note-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.note-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.scoreEditor.setDuration(btn.dataset.duration);
                this.scoreEditor.editMode = 'note';
            });
        });

        // Rest buttons
        document.querySelectorAll('.rest-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.rest-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.scoreEditor.editMode = 'rest';
            });
        });

        // Accidental buttons
        document.querySelectorAll('.accidental-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.accidental-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.scoreEditor.selectedAccidental = btn.dataset.accidental;
            });
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if in input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Ctrl+S - Save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveScore();
            }

            // Ctrl+O - Open
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                document.getElementById('fileInput').click();
            }

            // Ctrl+N - New
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.showModal('newScoreModal');
            }

            // Space - Play/Pause
            if (e.key === ' ') {
                e.preventDefault();
                document.getElementById('playBtn').click();
            }
        });
    }

    /**
     * Reinitialize playback after score changes
     */
    async reinitializePlayback() {
        try {
            const { visualObj } = this.scoreEditor.getScoreData();
            if (visualObj && visualObj.length > 0) {
                await this.playbackEngine.init(visualObj[0], '#abcAudio');
                console.log('✅ Playback reinitialized with updated score');
            }
        } catch (error) {
            console.error('❌ Failed to reinitialize playback:', error);
        }
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    updateImportStatus({ visible = true, status = 'running', fileName = '', message = '', detail = '' }) {
        const panel = document.getElementById('importStatusPanel');
        const fileEl = document.getElementById('importStatusFile');
        const badgeEl = document.getElementById('importStatusBadge');
        const messageEl = document.getElementById('importStatusMessage');
        const detailEl = document.getElementById('importStatusDetail');

        if (!panel || !fileEl || !badgeEl || !messageEl || !detailEl) return;

        panel.classList.toggle('hidden', !visible);
        panel.classList.remove('running', 'completed', 'failed');

        if (visible) {
            panel.classList.add(status);
        }

        fileEl.textContent = fileName || 'No active import';
        badgeEl.textContent = status === 'completed'
            ? 'Completed'
            : status === 'failed'
                ? 'Failed'
                : 'In Progress';
        messageEl.textContent = message || 'Waiting for updates...';
        detailEl.textContent = detail || '';
    }

    async startPdfImport(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/convert-pdf/start', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to start PDF conversion');
        }

        this.updateImportStatus({
            status: 'running',
            fileName: file.name,
            message: result.message || 'PDF uploaded. Preparing conversion...'
        });

        return result.jobId;
    }

    async pollPdfImport(jobId, fileName) {
        while (true) {
            const response = await fetch(`/api/convert-pdf/${jobId}/status`);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch PDF conversion status');
            }

            this.updateImportStatus({
                status: result.status,
                fileName: result.fileName || fileName,
                message: result.message || 'Processing PDF...',
                detail: result.error
                    ? result.error
                    : result.sourceXmlPath
                        ? `MusicXML: ${result.sourceXmlPath}`
                        : ''
            });

            if (result.status === 'completed') {
                return result;
            }

            if (result.status === 'failed') {
                throw new Error(result.error || result.message || 'PDF conversion failed');
            }

            await this.wait(this.pdfStatusPollMs);
        }
    }

    async fetchPdfImportResult(jobId) {
        const response = await fetch(`/api/convert-pdf/${jobId}/result`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to fetch converted ABC');
        }

        if (!result.abc) {
            throw new Error('PDF conversion completed, but no ABC output was returned');
        }

        return result;
    }

    /**
     * Open an ABC/TXT file or ingest a PDF
     */
    async openFile(file) {
        console.log('=== Starting file load ===' );
        console.log('File:', file.name, 'Size:', file.size, 'Type:', file.type);
        
        try {
            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.abc') && !fileName.endsWith('.txt') && !fileName.endsWith('.pdf')) {
                throw new Error('Unsupported format. Please open an .abc, .txt, or .pdf file.');
            }

            if (fileName.endsWith('.pdf')) {
                this.updateImportStatus({
                    visible: true,
                    status: 'running',
                    fileName: file.name,
                    message: 'Uploading PDF...'
                });

                const jobId = await this.startPdfImport(file);
                await this.pollPdfImport(jobId, file.name);
                const result = await this.fetchPdfImportResult(jobId);

                this.updateImportStatus({
                    visible: true,
                    status: 'running',
                    fileName: file.name,
                    message: 'Loading converted ABC notation...',
                    detail: result.sourceXmlPath ? `MusicXML: ${result.sourceXmlPath}` : ''
                });

                this.scoreEditor.loadABC(result.abc);
                console.log('✅ PDF converted and loaded as ABC');
            } else {
                this.showLoading();
                this.updateLoadingText(`Reading ${file.name}...`);
                
                // Read file as text
                const text = await file.text();
                console.log('ABC text loaded, length:', text.length);
                
                this.updateLoadingText('Loading ABC notation...');
                this.scoreEditor.loadABC(text);
            }

            this.updateLoadingText('Initializing playback...');
            // Initialize playback with rendered score
            const { visualObj } = this.scoreEditor.getScoreData();
            if (visualObj && visualObj.length > 0) {
                await this.playbackEngine.init(visualObj[0], '#abcAudio');
                console.log('✅ Playback engine initialized');
            } else {
                console.warn('⚠️ No visual object available for playback');
            }
            
            this.showScoreContent();
            if (!fileName.endsWith('.pdf')) {
                this.hideLoading();
            }

            if (fileName.endsWith('.pdf')) {
                this.updateImportStatus({
                    visible: true,
                    status: 'completed',
                    fileName: file.name,
                    message: 'PDF OCR/import finished and the score was loaded.',
                    detail: 'You can review the imported score and make manual corrections if needed.'
                });
                this.showToast(`✓ Imported PDF: ${file.name}`);
            } else {
                this.hideLoading();
                this.showToast(`✓ Opened: ${file.name}`);
            }
            console.log('=== File loaded successfully ===');
        } catch (error) {
            this.hideLoading();
            console.error('=== ERROR LOADING FILE ===');
            console.error('Error:', error);
            console.error('Stack:', error.stack);
            
            const errorMsg = error.message || 'Unknown error';
            this.showToast(`✗ Error: ${errorMsg}`, 'error');

            if (file.name.toLowerCase().endsWith('.pdf')) {
                this.updateImportStatus({
                    visible: true,
                    status: 'failed',
                    fileName: file.name,
                    message: 'PDF import failed.',
                    detail: errorMsg
                });
            }
        }
    }

    /**
     * Create a new score
     */
    async createNewScore() {
        const title = document.getElementById('scoreTitle').value || 'Untitled Score';
        const composer = document.getElementById('composer').value || '';
        const keySignature = document.getElementById('keySignature').value;
        const timeSignature = document.getElementById('timeSignature').value;
        const measures = parseInt(document.getElementById('measures').value) || 16;

        try {
            // Create simple ABC score
            const abc = `X:1
T:${title}
C:${composer}
M:${timeSignature}
L:1/4
K:${keySignature}
${'z4 |'.repeat(measures - 1)} z4 |]`;

            this.scoreEditor.loadABC(abc);
            
            // Initialize playback
            const { visualObj } = this.scoreEditor.getScoreData();
            if (visualObj && visualObj.length > 0) {
                await this.playbackEngine.init(visualObj[0], '#abcAudio');
            }

            this.hideModal('newScoreModal');
            this.showScoreContent();
            this.showToast('Score created');
        } catch (error) {
            console.error('Error creating score:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Save current score
     */
    saveScore() {
        const abc = this.scoreEditor.getABC();
        if (!abc) {
            this.showToast('No score to save');
            return;
        }

        this.scoreEditor.exportABC();
        this.showToast('Score saved');
    }

    /**
     * Add instrument row to new score modal
     */
    addInstrumentRow() {
        const list = document.getElementById('instrumentList');
        const newItem = document.createElement('div');
        newItem.className = 'instrument-item';
        newItem.innerHTML = `
            <select class="instrument-select">
                <option value="piano">Piano</option>
                <option value="violin">Violin</option>
                <option value="viola">Viola</option>
                <option value="cello">Cello</option>
                <option value="flute">Flute</option>
                <option value="clarinet">Clarinet</option>
                <option value="trumpet">Trumpet</option>
                <option value="voice">Voice</option>
            </select>
            <button class="remove-instrument-btn" title="Remove">&times;</button>
        `;

        newItem.querySelector('.remove-instrument-btn').addEventListener('click', () => {
            if (list.children.length > 1) {
                newItem.remove();
            }
        });

        list.appendChild(newItem);
    }

    /**
     * Show score content area
     */
    showScoreContent() {
        console.log('showScoreContent called');
        const emptyState = document.getElementById('emptyState');
        const scoreContent = document.getElementById('scoreContent');
        const osmdContainer = document.getElementById('osmdContainer');
        
        console.log('Elements:', {
            emptyState: emptyState,
            scoreContent: scoreContent,
            osmdContainer: osmdContainer
        });
        
        if (emptyState) {
            emptyState.style.display = 'none';
            console.log('Empty state hidden');
        }
        
        if (scoreContent) {
            scoreContent.style.display = 'block';
            scoreContent.style.visibility = 'visible';
            console.log('Score content shown');
        }
        
        if (osmdContainer) {
            osmdContainer.style.display = 'block';
            osmdContainer.style.visibility = 'visible';
            osmdContainer.style.minHeight = '600px';
            console.log('OSMD container shown, contents:', osmdContainer.innerHTML.substring(0, 200));
        }
        
        // Force a scroll to the score area
        setTimeout(() => {
            if (scoreContent) {
                scoreContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }

    /**
     * Load saved model preference
     */
    loadModelPreference() {
        const modelSelect = document.getElementById('modelSelect');

        if (modelSelect) {
            modelSelect.value = this.aiAssistant.getModel();
        }
    }

    /**
     * Add chat message to display
     */
    addChatMessage(content, role) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Parse markdown-like formatting
        let html = this.formatMessageContent(content);
        contentDiv.innerHTML = html;
        
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Format message content (simple markdown)
     */
    formatMessageContent(content) {
        // Handle code blocks
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        
        // Handle inline code
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Handle bold
        content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Handle italic
        content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Handle line breaks
        content = content.replace(/\n/g, '<br>');
        
        // Handle lists
        content = content.replace(/<br>- /g, '<br>• ');
        
        return `<p>${content}</p>`;
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        const chatMessages = document.getElementById('chatMessages');
        const indicator = document.createElement('div');
        indicator.className = 'chat-message assistant typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        chatMessages.appendChild(indicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return indicator;
    }

    /**
     * Show modal
     */
    showModal(modalId) {
        document.getElementById(modalId)?.classList.add('active');
    }

    /**
     * Hide modal
     */
    hideModal(modalId) {
        document.getElementById(modalId)?.classList.remove('active');
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Remove existing toasts
        document.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Show loading overlay
     */
    showLoading() {
        let overlay = document.getElementById('loadingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                color: white;
                font-size: 18px;
            `;
            overlay.innerHTML = `
                <div class="loading-spinner" style="
                    width: 50px;
                    height: 50px;
                    border: 4px solid rgba(255,255,255,0.3);
                    border-top-color: #1a73e8;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                "></div>
                <div id="loadingText">Loading...</div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    /**
     * Update loading text
     */
    updateLoadingText(text) {
        const loadingText = document.getElementById('loadingText');
        if (loadingText) {
            loadingText.textContent = text;
        }
    }

    /**
     * Set theme
     */
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }

    /**
     * Load theme from storage
     */
    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        this.setTheme(theme);
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            themeSelect.value = theme;
        }
    }

    /**
     * Save settings
     */
    saveSettings() {
        const theme = document.getElementById('themeSelect').value;
        this.setTheme(theme);
        this.hideModal('settingsModal');
        this.showToast('Settings saved');
    }
}

// Initialize app when DOM is ready
console.log('🚀 Waiting for DOMContentLoaded...');
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM ready, creating App instance...');
    try {
        window.app = new App();
        console.log('🚀 App instance created successfully');
    } catch (error) {
        console.error('💥 ERROR creating App:', error);
        console.error('Stack:', error.stack);
        alert('Failed to start application. Check console for details.');
    }
});
