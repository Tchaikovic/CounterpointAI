/**
 * ABC Notation Parser - Converts ABC notation to MusicXML modifications
 */
class ABCParser {
    constructor() {
        this.defaultDuration = 4; // quarter note
        this.currentMeasure = 1;
        this.currentBeat = 0;
        this.beatsPerMeasure = 4;
        this.divisions = 4; // divisions per quarter note
    }

    /**
     * Parse ABC notation and convert to modification objects
     */
    parseABC(abcString) {
        const modifications = [];
        const lines = abcString.split('\n').map(l => l.trim()).filter(l => l);
        
        let voiceName = 'Voice';
        let instrument = 'violin';
        let meter = '4/4';
        let key = 'C';
        let defaultLength = '1/4';
        
        // Parse header info
        for (const line of lines) {
            if (line.startsWith('V:')) {
                voiceName = line.substring(2).trim();
                instrument = this.detectInstrument(voiceName);
            } else if (line.startsWith('M:')) {
                meter = line.substring(2).trim();
                this.setMeter(meter);
            } else if (line.startsWith('K:')) {
                key = line.substring(2).trim();
            } else if (line.startsWith('L:')) {
                defaultLength = line.substring(2).trim();
                this.setDefaultLength(defaultLength);
            }
        }
        
        // Add the part
        modifications.push({
            type: 'addPart',
            instrument: instrument,
            partName: voiceName
        });
        
        // Find the part index (will be the last part)
        const partIndex = 'last'; // Will be replaced in processor
        
        // Parse music lines
        this.currentMeasure = 1;
        this.currentBeat = 0;
        
        for (const line of lines) {
            // Skip headers and comments
            if (line.startsWith('X:') || line.startsWith('T:') || 
                line.startsWith('M:') || line.startsWith('L:') || 
                line.startsWith('K:') || line.startsWith('V:') ||
                line.startsWith('%') || line.startsWith('%%')) {
                continue;
            }
            
            // Parse music line
            const notes = this.parseMusicLine(line, partIndex);
            modifications.push(...notes);
        }
        
        console.log(`📝 Parsed ABC notation: ${modifications.length} modifications`);
        return modifications;
    }
    
    /**
     * Parse a line of music notation
     */
    parseMusicLine(line, partIndex) {
        const notes = [];
        let i = 0;
        
        while (i < line.length) {
            const char = line[i];
            
            // Bar line
            if (char === '|') {
                if (line[i + 1] === ':' || line[i + 1] === ']') {
                    i += 2;
                } else if (line[i - 1] === ':') {
                    i++;
                } else {
                    this.currentMeasure++;
                    this.currentBeat = 0;
                    i++;
                }
                continue;
            }
            
            // Skip spaces and special chars
            if (char === ' ' || char === ':' || char === '[' || char === ']') {
                i++;
                continue;
            }
            
            // Parse note or rest
            const { note, length } = this.parseNote(line, i);
            if (note) {
                notes.push({
                    type: 'addNote',
                    partIndex: partIndex,
                    measureNumber: this.currentMeasure,
                    noteData: note
                });
                
                // Update beat position
                this.currentBeat += note.duration / this.divisions;
                if (this.currentBeat >= this.beatsPerMeasure) {
                    this.currentMeasure++;
                    this.currentBeat = 0;
                }
            }
            i += length;
        }
        
        return notes;
    }
    
    /**
     * Parse a single note or rest from ABC notation
     */
    parseNote(line, startIndex) {
        let i = startIndex;
        const char = line[i];
        
        // Check for rest
        if (char === 'z' || char === 'x') {
            i++;
            const duration = this.parseDuration(line, i);
            return {
                note: {
                    isRest: true,
                    duration: duration.value,
                    type: this.getDurationType(duration.value)
                },
                length: 1 + duration.length
            };
        }
        
        // Parse accidental
        let alter = 0;
        if (char === '^') {
            alter = 1;
            i++;
        } else if (char === '_') {
            alter = -1;
            i++;
        } else if (char === '=') {
            alter = 0;
            i++;
        }
        
        // Parse note letter
        const noteLetter = line[i];
        if (!/[A-Ga-g]/.test(noteLetter)) {
            return { note: null, length: 1 };
        }
        
        const step = noteLetter.toUpperCase();
        const octave = this.getOctave(noteLetter);
        i++;
        
        // Check for octave modifiers
        let octaveAdjust = 0;
        while (i < line.length && (line[i] === '\'' || line[i] === ',')) {
            octaveAdjust += line[i] === '\'' ? 1 : -1;
            i++;
        }
        
        // Parse duration
        const duration = this.parseDuration(line, i);
        
        return {
            note: {
                pitch: {
                    step: step,
                    octave: octave + octaveAdjust,
                    alter: alter
                },
                duration: duration.value,
                type: this.getDurationType(duration.value)
            },
            length: (i - startIndex) + duration.length
        };
    }
    
    /**
     * Parse duration modifier (2, /2, /4, etc.)
     */
    parseDuration(line, startIndex) {
        let i = startIndex;
        let multiplier = 1;
        
        // Check for multiplier (2, 3, 4, etc.)
        if (i < line.length && /[0-9]/.test(line[i])) {
            const numStr = this.readNumber(line, i);
            multiplier = parseInt(numStr);
            i += numStr.length;
        }
        // Check for division (/2, /4, etc.)
        else if (i < line.length && line[i] === '/') {
            i++;
            if (i < line.length && /[0-9]/.test(line[i])) {
                const numStr = this.readNumber(line, i);
                multiplier = 1 / parseInt(numStr);
                i += numStr.length;
            } else {
                multiplier = 0.5; // Just / means /2
            }
        }
        
        const value = this.defaultDuration * multiplier;
        return {
            value: Math.round(value),
            length: i - startIndex
        };
    }
    
    /**
     * Read a number from string
     */
    readNumber(line, startIndex) {
        let i = startIndex;
        while (i < line.length && /[0-9]/.test(line[i])) {
            i++;
        }
        return line.substring(startIndex, i);
    }
    
    /**
     * Get octave from note letter (uppercase = octave 4, lowercase = octave 5)
     */
    getOctave(letter) {
        return letter === letter.toUpperCase() ? 4 : 5;
    }
    
    /**
     * Convert duration to note type
     */
    getDurationType(duration) {
        if (duration >= 16) return 'whole';
        if (duration >= 8) return 'half';
        if (duration >= 4) return 'quarter';
        if (duration >= 2) return 'eighth';
        return 'sixteenth';
    }
    
    /**
     * Set meter (time signature)
     */
    setMeter(meter) {
        const parts = meter.split('/');
        if (parts.length === 2) {
            this.beatsPerMeasure = parseInt(parts[0]);
        }
    }
    
    /**
     * Set default note length
     */
    setDefaultLength(length) {
        const parts = length.split('/');
        if (parts.length === 2) {
            const denominator = parseInt(parts[1]);
            this.defaultDuration = 16 / denominator; // 16 = whole note in divisions
        }
    }
    
    /**
     * Detect instrument from voice name
     */
    detectInstrument(voiceName) {
        const name = voiceName.toLowerCase();
        if (name.includes('violin')) return 'violin';
        if (name.includes('viola')) return 'viola';
        if (name.includes('cello')) return 'cello';
        if (name.includes('bass')) return 'contrabass';
        if (name.includes('flute')) return 'flute';
        if (name.includes('oboe')) return 'oboe';
        if (name.includes('clarinet')) return 'clarinet';
        if (name.includes('trumpet')) return 'trumpet';
        if (name.includes('horn')) return 'horn';
        if (name.includes('piano')) return 'piano';
        return 'violin'; // default
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ABCParser;
}
