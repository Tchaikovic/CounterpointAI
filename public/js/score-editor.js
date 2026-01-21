/**
 * Score Editor - Handles music notation display and editing using OpenSheetMusicDisplay
 */
class ScoreEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.osmd = null;
        this.musicXMLGenerator = new MusicXMLGenerator();
        this.currentXML = null;
        this.zoom = 1.0;
        this.selectedNote = null;
        this.selectedDuration = 'quarter';
        this.selectedAccidental = null;
        this.editMode = 'select'; // 'select', 'note', 'rest'
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;

        this.initOSMD();
    }

    /**
     * Initialize OpenSheetMusicDisplay
     */
    async initOSMD() {
        console.log('Initializing OSMD...');
        console.log('Container element:', this.container);
        console.log('OSMD library available:', typeof opensheetmusicdisplay !== 'undefined');
        
        if (typeof opensheetmusicdisplay === 'undefined') {
            console.error('OpenSheetMusicDisplay library not loaded!');
            alert('Music notation library failed to load. Please refresh the page.');
            return;
        }

        try {
            this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(this.container, {
                autoResize: true,
                backend: 'svg',
                drawTitle: true,
                drawComposer: true,
                drawCredits: true,
                drawPartNames: true,
                drawMeasureNumbers: true,
                drawTimeSignatures: true,
                drawingParameters: 'compacttight',
                coloringMode: 0,
                coloringEnabled: false,
                colorStemsLikeNoteheads: false,
                disableCursor: false,
                followCursor: true,
                cursorsOptions: [{
                    type: 0,
                    color: '#1a73e8',
                    alpha: 0.5,
                    follow: true
                }]
            });

            console.log('OSMD instance created:', this.osmd);
            this.setupEventListeners();
            console.log('OSMD initialized successfully');
        } catch (error) {
            console.error('Error creating OSMD instance:', error);
            alert('Failed to initialize music notation renderer: ' + error.message);
        }
    }

    /**
     * Setup click and interaction listeners
     */
    setupEventListeners() {
        this.container.addEventListener('click', (e) => this.handleClick(e));
        this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    /**
     * Handle click on score
     */
    handleClick(event) {
        const target = event.target;
        
        // Check if clicked on a note
        if (target.closest('.vf-notehead') || target.closest('.vf-note')) {
            this.selectNote(target);
        } else if (target.closest('.vf-stavenote')) {
            this.selectNote(target);
        }

        // Get click position for adding notes
        const rect = this.container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (this.editMode === 'note' || this.editMode === 'rest') {
            this.addNoteAtPosition(x, y);
        }
    }

    /**
     * Handle mouse movement for hover effects
     */
    handleMouseMove(event) {
        // Could add hover highlighting here
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(event) {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (event.key) {
            case 'Delete':
            case 'Backspace':
                if (this.selectedNote) {
                    this.deleteSelectedNote();
                }
                break;
            case 'z':
                if (event.ctrlKey) {
                    if (event.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                }
                break;
            case 'y':
                if (event.ctrlKey) {
                    this.redo();
                }
                break;
            case '1':
                this.setDuration('whole');
                break;
            case '2':
                this.setDuration('half');
                break;
            case '3':
                this.setDuration('quarter');
                break;
            case '4':
                this.setDuration('eighth');
                break;
            case '5':
                this.setDuration('sixteenth');
                break;
            case 'ArrowUp':
                if (this.selectedNote) {
                    this.transposeSelected(1);
                    event.preventDefault();
                }
                break;
            case 'ArrowDown':
                if (this.selectedNote) {
                    this.transposeSelected(-1);
                    event.preventDefault();
                }
                break;
        }
    }

    /**
     * Load a MusicXML file
     */
    async loadMusicXML(xmlString) {
        console.log('loadMusicXML called, XML length:', xmlString?.length);
        
        if (!this.osmd) {
            console.error('OSMD not initialized');
            throw new Error('Music renderer not initialized');
        }

        if (!xmlString || xmlString.length === 0) {
            throw new Error('Empty music file');
        }

        try {
            console.log('Parsing XML with MusicXMLGenerator...');
            this.currentXML = xmlString;
            this.musicXMLGenerator.parseFromXML(xmlString);
            
            console.log('Loading into OSMD...');
            await this.osmd.load(xmlString);
            
            console.log('Rendering score...');
            this.osmd.render();
            
            console.log('Render complete. Container contents:', this.container.innerHTML.substring(0, 300));
            console.log('Container has children:', this.container.children.length);
            
            // Make absolutely sure the container is visible
            this.container.style.display = 'block';
            this.container.style.visibility = 'visible';
            this.container.style.opacity = '1';

            // Initialize cursor
            if (this.osmd.cursor) {
                this.osmd.cursor.show();
                console.log('Cursor shown');
            }

            this.saveToHistory();
            this.onScoreLoaded();

            console.log('Score loaded and rendered successfully');
            console.log('Final container dimensions:', {
                width: this.container.offsetWidth,
                height: this.container.offsetHeight,
                scrollHeight: this.container.scrollHeight
            });
            return true;
        } catch (error) {
            console.error('Error in loadMusicXML:', error);
            console.error('Error details:', error.message, error.stack);
            throw new Error(`Failed to load music: ${error.message}`);
        }
    }

    /**
     * Load from a file (handles .mscz, .musicxml, .mxl)
     */
    async loadFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        console.log('Loading file:', file.name, 'Extension:', extension);

        try {
            if (extension === 'mscz') {
                // MuseScore compressed format
                const arrayBuffer = await file.arrayBuffer();
                console.log('File size:', arrayBuffer.byteLength, 'bytes');
                
                const zip = await JSZip.loadAsync(arrayBuffer);
                const fileList = Object.keys(zip.files);
                console.log('MSCZ archive contents:', fileList);
                
                // MuseScore 4 structure: the score is typically in a file without extension or .mscx
                let scoreFile = null;
                let scoreFileName = null;
                
                // Priority order for finding the score file
                const searchPatterns = [
                    // MuseScore 3 pattern
                    (name) => name.endsWith('.mscx'),
                    // MuseScore 4 patterns
                    (name) => name === 'score.mscx',
                    (name) => name === 'mscx',
                    (name) => name.includes('.mscx'),
                    // Look for any XML-like content
                    (name) => !name.endsWith('/') && !name.includes('.') && name.length > 0
                ];
                
                for (const pattern of searchPatterns) {
                    for (const filename of fileList) {
                        if (pattern(filename) && !zip.files[filename].dir) {
                            scoreFile = zip.files[filename];
                            scoreFileName = filename;
                            console.log('Found potential score file:', filename);
                            break;
                        }
                    }
                    if (scoreFile) break;
                }

                if (!scoreFile) {
                    // Last resort: try the first non-directory file
                    for (const filename of fileList) {
                        if (!zip.files[filename].dir && !filename.startsWith('Thumbnails') && !filename.endsWith('.png')) {
                            scoreFile = zip.files[filename];
                            scoreFileName = filename;
                            console.log('Using fallback file:', filename);
                            break;
                        }
                    }
                }

                if (!scoreFile) {
                    const availableFiles = fileList.filter(f => !zip.files[f].dir).join(', ');
                    throw new Error(`No score file found in .mscz archive. Files found: ${availableFiles}`);
                }

                console.log('Reading score file:', scoreFileName);
                const mscxContent = await scoreFile.async('string');
                console.log('Content length:', mscxContent.length);
                console.log('Content preview:', mscxContent.substring(0, 500));
                
                // Check if it's valid XML
                if (!mscxContent.includes('<?xml') && !mscxContent.includes('<museScore') && !mscxContent.includes('<score')) {
                    console.log('Content does not appear to be XML, trying binary...');
                    // It might be binary/compressed content inside
                    throw new Error('MuseScore 4 uses a binary format inside the archive. Please export your score as MusicXML from MuseScore (File > Export > MusicXML)');
                }
                
                // Convert MSCX to MusicXML
                const xmlContent = this.convertMSCXtoMusicXML(mscxContent);
                return await this.loadMusicXML(xmlContent);

            } else if (extension === 'mxl') {
                // Compressed MusicXML
                const arrayBuffer = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(arrayBuffer);
                
                console.log('MXL contents:', Object.keys(zip.files));
                
                // Look for the main XML file
                let mainFile = null;
                const containerFile = zip.file('META-INF/container.xml');
                
                if (containerFile) {
                    const container = await containerFile.async('string');
                    const match = container.match(/full-path="([^"]+)"/);
                    if (match) mainFile = match[1];
                }
                
                // Fallback to common names
                if (!mainFile) {
                    const possibleNames = ['score.xml', 'part1.xml', 'music.xml'];
                    for (const name of possibleNames) {
                        if (zip.files[name]) {
                            mainFile = name;
                            break;
                        }
                    }
                }
                
                // Try any XML file
                if (!mainFile) {
                    for (const filename of Object.keys(zip.files)) {
                        if (filename.endsWith('.xml') && !filename.includes('META-INF')) {
                            mainFile = filename;
                            break;
                        }
                    }
                }

                if (!mainFile || !zip.files[mainFile]) {
                    throw new Error('No score file found in .mxl archive');
                }

                const xmlContent = await zip.files[mainFile].async('string');
                return await this.loadMusicXML(xmlContent);

            } else if (extension === 'musicxml' || extension === 'xml') {
                const xmlContent = await file.text();
                return await this.loadMusicXML(xmlContent);
            }

            throw new Error('Unsupported file format');
        } catch (error) {
            console.error('Error loading file:', error);
            throw error;
        }
    }

    /**
     * Convert MuseScore MSCX format to MusicXML
     */
    convertMSCXtoMusicXML(mscxContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(mscxContent, 'text/xml');
        
        // Check for parse errors
        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            console.error('XML Parse Error:', parseError.textContent);
            throw new Error('Invalid MSCX file format');
        }

        console.log('Parsing MSCX document...');
        
        // Extract basic information
        const title = doc.querySelector('metaTag[name="workTitle"]')?.textContent || 
                     doc.querySelector('Text text')?.textContent || 
                     'Imported Score';
        const composer = doc.querySelector('metaTag[name="composer"]')?.textContent || '';

        // Get time signature
        const timeSig = doc.querySelector('TimeSig');
        const beats = timeSig?.querySelector('sigN')?.textContent || '4';
        const beatType = timeSig?.querySelector('sigD')?.textContent || '4';

        // Get key signature (MuseScore uses different format)
        const keySig = doc.querySelector('KeySig');
        let fifths = 0;
        if (keySig) {
            const accidental = keySig.querySelector('accidental');
            if (accidental) {
                fifths = parseInt(accidental.textContent) || 0;
            }
        }

        // Parse all staves
        const staves = doc.querySelectorAll('Staff');
        console.log('Found staves:', staves.length);
        
        const parts = [];
        
        staves.forEach((staff, staffIndex) => {
            const partId = `P${staffIndex + 1}`;
            const measures = staff.querySelectorAll('Measure');
            console.log(`Staff ${staffIndex + 1} has ${measures.length} measures`);
            
            let measuresXml = '';
            
            measures.forEach((measure, measureIndex) => {
                let measureContent = '';
                
                // Add attributes for first measure
                if (measureIndex === 0) {
                    measureContent += `
            <attributes>
                <divisions>4</divisions>
                <key>
                    <fifths>${fifths}</fifths>
                </key>
                <time>
                    <beats>${beats}</beats>
                    <beat-type>${beatType}</beat-type>
                </time>
                <clef>
                    <sign>G</sign>
                    <line>2</line>
                </clef>
            </attributes>`;
                }
                
                // Parse notes and rests in the measure
                const voiceElements = measure.querySelectorAll('voice');
                
                if (voiceElements.length > 0) {
                    voiceElements.forEach(voice => {
                        const chords = voice.querySelectorAll('Chord');
                        const rests = voice.querySelectorAll('Rest');
                        
                        // Process chords (which contain notes)
                        chords.forEach(chord => {
                            const durationTypeEl = chord.querySelector('durationType');
                            const durationType = durationTypeEl?.textContent || 'quarter';
                            const duration = this.durationTypeToDivisions(durationType);
                            const noteType = this.durationTypeToMusicXML(durationType);
                            
                            const notes = chord.querySelectorAll('Note');
                            notes.forEach((note, noteIndex) => {
                                const pitchEl = note.querySelector('pitch');
                                const tpcEl = note.querySelector('tpc');
                                
                                if (pitchEl) {
                                    const midiPitch = parseInt(pitchEl.textContent);
                                    const { step, octave, alter } = this.midiPitchToNote(midiPitch, tpcEl?.textContent);
                                    
                                    measureContent += `
            <note>`;
                                    if (noteIndex > 0) {
                                        measureContent += `
                <chord/>`;
                                    }
                                    measureContent += `
                <pitch>
                    <step>${step}</step>${alter !== 0 ? `
                    <alter>${alter}</alter>` : ''}
                    <octave>${octave}</octave>
                </pitch>
                <duration>${duration}</duration>
                <type>${noteType}</type>
            </note>`;
                                }
                            });
                        });
                        
                        // Process rests
                        rests.forEach(rest => {
                            const durationTypeEl = rest.querySelector('durationType');
                            const durationType = durationTypeEl?.textContent || 'quarter';
                            const duration = this.durationTypeToDivisions(durationType);
                            const restType = this.durationTypeToMusicXML(durationType);
                            
                            measureContent += `
            <note>
                <rest/>
                <duration>${duration}</duration>
                <type>${restType}</type>
            </note>`;
                        });
                    });
                } else {
                    // No voice elements, add a whole rest
                    measureContent += `
            <note>
                <rest measure="yes"/>
                <duration>${parseInt(beats) * 4}</duration>
                <type>whole</type>
            </note>`;
                }
                
                measuresXml += `
        <measure number="${measureIndex + 1}">${measureContent}
        </measure>`;
            });
            
            parts.push({
                id: partId,
                name: `Part ${staffIndex + 1}`,
                measuresXml: measuresXml
            });
        });
        
        // If no staves found, create a default empty score
        if (parts.length === 0) {
            console.warn('No staves found, creating default score');
            return this.musicXMLGenerator.createNewScore({
                title,
                composer,
                timeSignature: `${beats}/${beatType}`,
                keySignature: this.fifthsToKey(fifths),
                measures: 16,
                instruments: ['piano']
            });
        }
        
        // Build the MusicXML document
        let partListXml = '';
        let partsXml = '';
        
        parts.forEach(part => {
            partListXml += `
        <score-part id="${part.id}">
            <part-name>${part.name}</part-name>
        </score-part>`;
            
            partsXml += `
    <part id="${part.id}">${part.measuresXml}
    </part>`;
        });
        
        const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
    <work>
        <work-title>${this.escapeXml(title)}</work-title>
    </work>
    <identification>
        <creator type="composer">${this.escapeXml(composer)}</creator>
        <encoding>
            <software>CounterpointAI</software>
            <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>
        </encoding>
    </identification>
    <part-list>${partListXml}
    </part-list>${partsXml}
</score-partwise>`;

        console.log('Generated MusicXML:', musicXml.substring(0, 1000));
        return musicXml;
    }
    
    /**
     * Convert MIDI pitch number to note name
     */
    midiPitchToNote(midiPitch, tpc) {
        const noteNames = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
        const noteAlters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
        
        const octave = Math.floor(midiPitch / 12) - 1;
        const noteIndex = midiPitch % 12;
        
        let step = noteNames[noteIndex];
        let alter = noteAlters[noteIndex];
        
        // Use TPC (tonal pitch class) if available for more accurate accidentals
        if (tpc !== undefined && tpc !== null) {
            const tpcValue = parseInt(tpc);
            // TPC: -1=Fbb, 0=Cbb, 1=Gbb, ..., 13=C, 14=G, ..., 33=B##
            const tpcSteps = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
            const tpcAlters = [-2, -2, -2, -2, -2, -2, -2, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2];
            
            if (tpcValue >= -1 && tpcValue <= 33) {
                step = tpcSteps[(tpcValue + 1) % 7];
                alter = tpcAlters[tpcValue + 1] || 0;
            }
        }
        
        return { step, octave, alter };
    }
    
    /**
     * Convert MuseScore duration type to MusicXML divisions
     */
    durationTypeToDivisions(durationType) {
        const durations = {
            'whole': 16,
            'half': 8,
            'quarter': 4,
            'eighth': 2,
            '16th': 1,
            '32nd': 0.5,
            '64th': 0.25
        };
        return durations[durationType] || 4;
    }
    
    /**
     * Convert MuseScore duration type to MusicXML type
     */
    durationTypeToMusicXML(durationType) {
        const types = {
            'whole': 'whole',
            'half': 'half',
            'quarter': 'quarter',
            'eighth': 'eighth',
            '16th': '16th',
            '32nd': '32nd',
            '64th': '64th'
        };
        return types[durationType] || 'quarter';
    }
    
    /**
     * Escape XML special characters
     */
    escapeXml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Convert fifths value to key name
     */
    fifthsToKey(fifths) {
        const keys = {
            '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', 
            '-2': 'Bb', '-1': 'F', '0': 'C', '1': 'G', '2': 'D',
            '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#'
        };
        return keys[fifths.toString()] || 'C';
    }

    /**
     * Create a new empty score
     */
    async createNewScore(options) {
        const xmlContent = this.musicXMLGenerator.createNewScore(options);
        return await this.loadMusicXML(xmlContent);
    }

    /**
     * Select a note element
     */
    selectNote(element) {
        // Deselect previous
        if (this.selectedNote) {
            this.selectedNote.classList.remove('note-selected');
        }

        // Find the note group
        const noteGroup = element.closest('g[class*="vf-"]') || element;
        noteGroup.classList.add('note-selected');
        this.selectedNote = noteGroup;

        this.onNoteSelected(noteGroup);
    }

    /**
     * Delete selected note
     */
    deleteSelectedNote() {
        if (!this.selectedNote) return;

        // Get note ID and remove from data
        const noteId = this.selectedNote.dataset?.noteId;
        if (noteId) {
            this.musicXMLGenerator.removeNote(noteId);
        }

        this.selectedNote.remove();
        this.selectedNote = null;
        this.saveToHistory();
        this.refresh();
    }

    /**
     * Add a note at click position
     */
    addNoteAtPosition(x, y) {
        // This would require mapping screen coordinates to musical position
        // For now, this is a placeholder
        console.log('Add note at:', x, y);
    }

    /**
     * Transpose selected note
     */
    transposeSelected(semitones) {
        if (!this.selectedNote) return;
        // Implementation depends on OSMD internals
        console.log('Transpose by:', semitones);
    }

    /**
     * Set current note duration
     */
    setDuration(duration) {
        this.selectedDuration = duration;
        document.querySelectorAll('.note-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.duration === duration);
        });
    }

    /**
     * Set zoom level
     */
    setZoom(zoom) {
        this.zoom = Math.max(0.5, Math.min(2.0, zoom));
        if (this.osmd) {
            this.osmd.zoom = this.zoom;
            this.osmd.render();
        }
        return this.zoom;
    }

    /**
     * Zoom in
     */
    zoomIn() {
        return this.setZoom(this.zoom + 0.1);
    }

    /**
     * Zoom out
     */
    zoomOut() {
        return this.setZoom(this.zoom - 0.1);
    }

    /**
     * Refresh the display
     */
    async refresh() {
        if (this.osmd) {
            // Use the XML document directly to preserve all original formatting
            const xmlDoc = this.musicXMLGenerator.xmlDoc;
            if (xmlDoc) {
                const serializer = new XMLSerializer();
                const newXML = serializer.serializeToString(xmlDoc);
                this.currentXML = newXML;
                await this.osmd.load(newXML);
                this.osmd.render();
                console.log('✅ Display refreshed from XML document');
            } else if (this.currentXML) {
                // Fallback to export if no xmlDoc
                const newXML = this.musicXMLGenerator.exportToXML();
                if (newXML) {
                    this.currentXML = newXML;
                    await this.osmd.load(newXML);
                    this.osmd.render();
                    console.log('✅ Display refreshed from exported XML');
                }
            }
        }
    }

    /**
     * Save current state to history
     */
    saveToHistory() {
        const state = this.musicXMLGenerator.exportToXML();
        if (!state) return;

        // Remove any redo history
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        this.history.push(state);
        
        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        this.historyIndex = this.history.length - 1;
    }

    /**
     * Undo last action
     */
    async undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const state = this.history[this.historyIndex];
            await this.loadMusicXML(state);
        }
    }

    /**
     * Redo last undone action
     */
    async redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const state = this.history[this.historyIndex];
            await this.loadMusicXML(state);
        }
    }

    /**
     * Get current score data
     */
    getScoreData() {
        return this.musicXMLGenerator.getScoreData();
    }

    /**
     * Get current MusicXML string
     */
    getMusicXML() {
        return this.musicXMLGenerator.exportToXML() || this.currentXML;
    }

    /**
     * Apply AI-generated modifications
     */
    async applyModifications(modifications) {
        console.log('🤖 Applying AI modifications:', modifications);
        
        const scoreData = this.musicXMLGenerator.getScoreData();
        if (!scoreData) {
            console.error('❌ No score data available');
            return false;
        }

        console.log('📊 Current score structure:', {
            parts: scoreData.parts.length,
            measures: scoreData.parts[0]?.measures.length
        });

        // Apply each modification
        for (const mod of modifications) {
            console.log('  Applying modification:', mod.type, mod);
            
            switch (mod.type) {
                case 'addPart':
                    const partResult = this.musicXMLGenerator.addPart(
                        mod.instrument || 'piano',
                        mod.partName || null
                    );
                    if (partResult) {
                        console.log('  ✅ Part added:', partResult);
                        // Store the new part index for subsequent note additions
                        mod._newPartIndex = partResult.partIndex;
                    } else {
                        console.error('  ❌ Failed to add part');
                    }
                    break;
                    
                case 'addNote':
                    const result = this.musicXMLGenerator.addNote(
                        mod.partIndex || 0,
                        mod.measureNumber,
                        mod.noteData
                    );
                    console.log('  addNote result:', result);
                    break;
                    
                case 'removeNote':
                    this.musicXMLGenerator.removeNote(mod.noteId);
                    break;
                    
                case 'updateNote':
                    this.musicXMLGenerator.updateNote(mod.noteId, mod.updates);
                    break;
                    
                case 'addMeasure':
                    console.warn('  addMeasure not implemented');
                    break;
                    
                case 'transpose':
                    console.warn('  transpose not implemented');
                    break;
                    
                default:
                    console.warn('  Unknown modification type:', mod.type);
            }
        }

        console.log('🔄 Refreshing display...');
        await this.refresh();
        this.saveToHistory();
        console.log('✅ Modifications applied');
        return true;
    }

    /**
     * Export current score as file
     */
    exportToFile(format = 'musicxml') {
        const xml = this.getMusicXML();
        if (!xml) return null;

        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `score.${format === 'musicxml' ? 'musicxml' : 'xml'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return true;
    }

    /**
     * Callbacks for external handlers
     */
    onScoreLoaded() {
        // Override this to handle score load
    }

    onNoteSelected(note) {
        // Override this to handle note selection
    }

    /**
     * Get notes for playback
     */
    getNotesForPlayback() {
        const scoreData = this.getScoreData();
        console.log('=== GET NOTES FOR PLAYBACK ===');
        console.log('Score data:', scoreData);
        
        if (!scoreData || !scoreData.parts || scoreData.parts.length === 0) {
            console.error('No score data available for playback');
            return [];
        }

        const notes = [];
        const tempo = scoreData.tempo || 120;
        console.log('Tempo:', tempo, 'BPM');
        
        // Calculate milliseconds per quarter note
        const msPerQuarterNote = 60000 / tempo;
        console.log('Ms per quarter note:', msPerQuarterNote);

        // Track global divisions (may change per measure)
        let globalDivisions = 1;

        scoreData.parts.forEach((part, partIndex) => {
            let currentTime = 0;
            console.log(`\n--- Part ${partIndex}: ${part.name} (${part.measures.length} measures) ---`);

            part.measures.forEach((measure, measureIndex) => {
                // Update divisions if specified in this measure
                if (measure.attributes?.divisions) {
                    globalDivisions = measure.attributes.divisions;
                }
                
                const divisions = globalDivisions;
                console.log(`Measure ${measureIndex + 1}: divisions=${divisions}, notes=${measure.notes.length}`);
                
                measure.notes.forEach((note, noteIndex) => {
                    if (!note.isRest && note.pitch) {
                        // Duration is in divisions - convert to quarter notes then to ms
                        const durationInQuarters = note.duration / divisions;
                        const durationMs = durationInQuarters * msPerQuarterNote;

                        const playbackNote = {
                            pitch: `${note.pitch.step}${note.pitch.octave}`,
                            alter: note.pitch.alter || 0,
                            time: currentTime,
                            duration: durationMs,
                            velocity: 0.7,
                            part: partIndex,
                            measure: measureIndex,
                            isChord: note.isChord || false
                        };
                        
                        notes.push(playbackNote);
                        
                        if (notes.length <= 10) {
                            console.log(`  Note: ${playbackNote.pitch} @ ${(currentTime/1000).toFixed(2)}s dur=${(durationMs/1000).toFixed(2)}s (raw=${note.duration} divs=${divisions})`);
                        }

                        // Only advance time if not a chord
                        if (!note.isChord) {
                            currentTime += durationMs;
                        }
                    } else if (note.isRest && !note.isChord) {
                        // Advance time for rests
                        const durationInQuarters = note.duration / divisions;
                        const durationMs = durationInQuarters * msPerQuarterNote;
                        if (notes.length <= 10) {
                            console.log(`  Rest: ${(durationMs/1000).toFixed(2)}s`);
                        }
                        currentTime += durationMs;
                    }
                });
            });
        });

        console.log('\n=== TOTAL NOTES EXTRACTED:', notes.length, '===');
        if (notes.length > 0) {
            console.log('First note:', notes[0]);
            console.log('Last note:', notes[notes.length - 1]);
        }
        return notes.sort((a, b) => a.time - b.time);
    }

    /**
     * Get cursor controller
     */
    getCursor() {
        return this.osmd?.cursor;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScoreEditor;
}
