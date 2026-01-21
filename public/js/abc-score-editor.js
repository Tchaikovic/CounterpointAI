/**
 * ABC Score Editor - Handles ABC notation editing and rendering
 */
class ABCScoreEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.abcNotation = '';
        this.visualObj = null;
        this.synthControl = null;
        
        // Create editor and display areas
        this.createEditorUI();
    }

    /**
     * Create the editor UI
     */
    createEditorUI() {
        this.container.innerHTML = `
            <div class="abc-editor-container">
                <div class="abc-editor-panel" id="abcEditorPanel">
                    <div class="editor-toolbar">
                        <button id="toggleEditorBtn" class="editor-btn" title="Toggle Editor">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <button id="formatBtn" class="editor-btn" title="Format ABC">
                            <i class="fas fa-align-left"></i> Format
                        </button>
                        <button id="validateBtn" class="editor-btn" title="Validate ABC">
                            <i class="fas fa-check-circle"></i> Validate
                        </button>
                        <button id="exportBtn" class="editor-btn" title="Export ABC">
                            <i class="fas fa-download"></i> Export
                        </button>
                    </div>
                    <textarea id="abcEditor" class="abc-editor" spellcheck="false" placeholder="Paste or type ABC notation here...

Example:
X:1
T:My Song
M:4/4
L:1/4
K:C
|: C E G c | e d c2 | G B d g | f e d2 :|"></textarea>
                </div>
                <div class="abc-display-panel">
                    <div id="abcPaper" class="abc-paper"></div>
                    <div id="abcAudio"></div>
                    <div id="abcWarnings" class="abc-warnings"></div>
                </div>
            </div>
        `;

        this.editor = document.getElementById('abcEditor');
        this.paper = document.getElementById('abcPaper');
        this.audioDiv = document.getElementById('abcAudio');
        this.warningsDiv = document.getElementById('abcWarnings');
        this.editorPanel = document.getElementById('abcEditorPanel');

        // Setup event listeners
        this.editor.addEventListener('input', () => this.debounceRender());
        
        document.getElementById('toggleEditorBtn')?.addEventListener('click', () => this.toggleEditor());
        document.getElementById('formatBtn')?.addEventListener('click', () => this.formatABC());
        document.getElementById('validateBtn')?.addEventListener('click', () => this.validateABC());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportABC());

        // Initial render
        this.loadDefaultScore();
    }

    /**
     * Load default score
     */
    loadDefaultScore() {
        const defaultABC = `X:1
T:Welcome to CounterpointAI
C:AI Music Assistant
M:4/4
L:1/4
K:C
|: C E G c | e d c2 | G B d g | f e d2 :|
|: A c e a | g f e2 | d f a d' | c4 :|`;
        
        this.loadABC(defaultABC);
    }

    /**
     * Load ABC notation
     */
    loadABC(abcString) {
        this.abcNotation = abcString;
        this.editor.value = abcString;
        this.renderABC();
    }

    /**
     * Get current ABC notation
     */
    getABC() {
        return this.editor.value;
    }

    /**
     * Render ABC notation
     */
    renderABC() {
        const abc = this.editor.value.trim();
        if (!abc) {
            this.paper.innerHTML = '<p class="empty-message">Start typing ABC notation...</p>';
            return;
        }

        try {
            // Clear previous render
            this.paper.innerHTML = '';
            this.warningsDiv.innerHTML = '';

            // Render the score
            this.visualObj = ABCJS.renderAbc(this.paper, abc, {
                responsive: 'resize',
                viewportHorizontal: true,
                viewportVertical: true,
                scale: 1.0,
                staffwidth: 800,
                add_classes: true,
                // Filter out decoration warnings
                warnings: (warning) => {
                    // Don't display unknown decoration warnings
                    if (warning.message && warning.message.includes('Unknown decoration')) {
                        return false;
                    }
                    return true;
                }
            });

            // Check for important warnings (non-decoration)
            if (this.visualObj && this.visualObj[0] && this.visualObj[0].warnings) {
                const warnings = this.visualObj[0].warnings.filter(w => {
                    const msg = w.message || w.toString();
                    return !msg.includes('Unknown decoration');
                });
                if (warnings.length > 0) {
                    this.showWarnings(warnings);
                }
            }

            console.log('✅ ABC rendered successfully');
        } catch (error) {
            this.showError(error.message);
            console.error('❌ ABC render error:', error);
        }
    }

    /**
     * Debounce render to avoid excessive re-renders
     */
    debounceRender() {
        clearTimeout(this.renderTimeout);
        this.renderTimeout = setTimeout(() => this.renderABC(), 300);
    }

    /**
     * Format ABC notation
     */
    formatABC() {
        const abc = this.editor.value;
        // Basic formatting - ensure proper line breaks and spacing
        const formatted = abc
            .split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .join('\n');
        
        this.editor.value = formatted;
        this.renderABC();
    }

    /**
     * Validate ABC notation
     */
    validateABC() {
        const abc = this.editor.value;
        if (!abc.trim()) {
            this.showWarning('No ABC notation to validate');
            return;
        }

        try {
            // Try to parse
            const result = ABCJS.renderAbc('*', abc, { visualTranspose: 0 });
            
            if (result && result[0]) {
                if (result[0].warnings && result[0].warnings.length > 0) {
                    this.showWarnings(result[0].warnings);
                } else {
                    this.showSuccess('ABC notation is valid!');
                }
            }
        } catch (error) {
            this.showError(error.message);
        }
    }

    /**
     * Export ABC notation
     */
    exportABC() {
        const abc = this.editor.value;
        const blob = new Blob([abc], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'score.abc';
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Show warnings
     */
    showWarnings(warnings) {
        const warningHtml = warnings.map(w => 
            `<div class="warning-item">⚠️ ${w.message || w}</div>`
        ).join('');
        this.warningsDiv.innerHTML = `<div class="warnings-box">${warningHtml}</div>`;
    }

    /**
     * Show error
     */
    showError(message) {
        this.warningsDiv.innerHTML = `<div class="error-box">❌ Error: ${message}</div>`;
    }

    /**
     * Show warning
     */
    showWarning(message) {
        this.warningsDiv.innerHTML = `<div class="warning-box">⚠️ ${message}</div>`;
    }

    /**
     * Show success
     */
    showSuccess(message) {
        this.warningsDiv.innerHTML = `<div class="success-box">✅ ${message}</div>`;
        setTimeout(() => {
            this.warningsDiv.innerHTML = '';
        }, 3000);
    }

    /**
     * Toggle editor panel visibility
     */
    toggleEditor() {
        this.editorPanel.classList.toggle('collapsed');
        const toggleBtn = document.getElementById('toggleEditorBtn');
        const icon = toggleBtn.querySelector('i');
        
        if (this.editorPanel.classList.contains('collapsed')) {
            icon.className = 'fas fa-chevron-right';
            toggleBtn.title = 'Show Editor';
        } else {
            icon.className = 'fas fa-chevron-left';
            toggleBtn.title = 'Hide Editor';
        }
    }

    /**
     * Add a new part to the score
     */
    addPart(partABC) {
        console.log('📝 Adding part to score...');
        console.log('Part ABC length:', partABC.length);
        
        const currentABC = this.editor.value;
        
        // Check if the new part is a complete score (has headers) or just a voice
        const hasHeaders = partABC.match(/^X:\d+/m);
        
        if (hasHeaders) {
            console.log('⚠️ Detected full score with headers - extracting new voice only');
            
            // Find the LAST occurrence of V: which should be the new voice
            const lastVMatch = partABC.lastIndexOf('\nV:');
            
            if (lastVMatch > 0) {
                // Extract from last V: to end of string
                const newVoice = partABC.substring(lastVMatch + 1).trim();
                
                console.log('✅ Extracted new voice from position', lastVMatch);
                console.log('New voice preview:', newVoice.substring(0, 200));
                console.log('New voice length:', newVoice.length, 'characters');
                
                // Check if current ABC already has this voice
                const currentLines = currentABC.split('\n');
                const existingVoiceDeclarations = currentLines.filter(line => line.match(/^V:/));
                const newVoiceDeclaration = newVoice.split('\n')[0];
                
                console.log('Existing voices:', existingVoiceDeclarations);
                console.log('New voice declaration:', newVoiceDeclaration);
                
                // Only add if it's truly a new voice
                if (!currentABC.includes(newVoiceDeclaration)) {
                    const newABC = currentABC + '\n\n' + newVoice;
                    this.loadABC(newABC);
                    console.log('✅ Added new voice to score');
                    
                    // Trigger playback reinitialization
                    this.triggerPlaybackUpdate();
                } else {
                    console.log('⚠️ Voice already exists, skipping');
                    this.showWarning('This voice already exists in the score');
                }
            } else {
                console.log('⚠️ Could not find voice declaration with lastIndexOf, trying line-by-line');
                const lines = partABC.split('\n');
                const voiceStartIndex = lines.findIndex(line => line.match(/^V:/));
                if (voiceStartIndex >= 0) {
                    const voiceLines = lines.slice(voiceStartIndex).join('\n');
                    const newABC = currentABC + '\n\n' + voiceLines;
                    this.loadABC(newABC);
                } else {
                    const newABC = currentABC + '\n\n' + partABC;
                    this.loadABC(newABC);
                }
            }
        } else {
            // Just a voice part, append directly
            console.log('✅ Adding voice part directly');
            const newABC = currentABC + '\n\n' + partABC;
            this.loadABC(newABC);
        }
    }

    /**
     * Get notes for playback
     */
    getNotesForPlayback() {
        if (!this.visualObj || !this.visualObj[0]) {
            return [];
        }

        const notes = [];
        const tune = this.visualObj[0];

        // Extract timing and pitch information from abcjs visual object
        if (tune.lines) {
            tune.lines.forEach(line => {
                if (line.staff) {
                    line.staff.forEach(staff => {
                        if (staff.voices) {
                            staff.voices.forEach(voice => {
                                voice.forEach(element => {
                                    if (element.pitches) {
                                        element.pitches.forEach(pitch => {
                                            notes.push({
                                                pitch: this.midiNumberToNote(pitch.pitch),
                                                startTime: element.abselem?.startTime || 0,
                                                duration: element.duration || 0.25,
                                                velocity: 0.7
                                            });
                                        });
                                    }
                                });
                            });
                        }
                    });
                }
            });
        }

        return notes;
    }

    /**
     * Convert MIDI number to note name
     */
    midiNumberToNote(midiNumber) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNumber / 12) - 1;
        const noteIndex = midiNumber % 12;
        return notes[noteIndex] + octave;
    }

    /**
     * Trigger playback update (will be called by app.js)
     */
    triggerPlaybackUpdate() {
        // Dispatch custom event that app.js can listen to
        window.dispatchEvent(new CustomEvent('abcScoreUpdated', {
            detail: {
                visualObj: this.visualObj,
                abc: this.editor.value
            }
        }));
    }

    /**
     * Get score data (for compatibility)
     */
    getScoreData() {
        return {
            abc: this.editor.value,
            visualObj: this.visualObj
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ABCScoreEditor;
}
