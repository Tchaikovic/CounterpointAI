/**
 * MusicXML Generator - Creates and manipulates MusicXML documents
 */
class MusicXMLGenerator {
    constructor() {
        this.xmlDoc = null;
        this.scoreData = null;
    }

    /**
     * Create a new empty score
     */
    createNewScore(options = {}) {
        const {
            title = 'Untitled Score',
            composer = 'Anonymous',
            keySignature = 'C',
            timeSignature = '4/4',
            measures = 16,
            instruments = ['piano']
        } = options;

        const [beats, beatType] = timeSignature.split('/').map(Number);
        const fifths = this.keyToFifths(keySignature);

        let partsXml = '';
        let partListXml = '';

        instruments.forEach((instrument, index) => {
            const partId = `P${index + 1}`;
            const instrumentInfo = this.getInstrumentInfo(instrument);

            partListXml += `
        <score-part id="${partId}">
            <part-name>${instrumentInfo.name}</part-name>
            <score-instrument id="${partId}-I1">
                <instrument-name>${instrumentInfo.name}</instrument-name>
            </score-instrument>
            <midi-instrument id="${partId}-I1">
                <midi-channel>1</midi-channel>
                <midi-program>${instrumentInfo.midiProgram}</midi-program>
                <volume>80</volume>
                <pan>0</pan>
            </midi-instrument>
        </score-part>`;

            let measuresXml = '';
            for (let m = 1; m <= measures; m++) {
                let measureContent = '';

                if (m === 1) {
                    measureContent = `
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
                    <sign>${instrumentInfo.clef}</sign>
                    <line>${instrumentInfo.clefLine}</line>
                </clef>
            </attributes>
            <direction placement="above">
                <direction-type>
                    <metronome>
                        <beat-unit>quarter</beat-unit>
                        <per-minute>120</per-minute>
                    </metronome>
                </direction-type>
            </direction>`;
                }

                // Add a whole rest for each measure
                const restDuration = beats * 4; // Assuming divisions = 4
                measureContent += `
            <note>
                <rest measure="yes"/>
                <duration>${restDuration}</duration>
                <type>whole</type>
            </note>`;

                measuresXml += `
        <measure number="${m}">${measureContent}
        </measure>`;
            }

            partsXml += `
    <part id="${partId}">${measuresXml}
    </part>`;
        });

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
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

        this.xmlDoc = new DOMParser().parseFromString(xml, 'text/xml');
        this.parseScoreData();
        return xml;
    }

    /**
     * Parse MusicXML string into internal data structure
     */
    parseFromXML(xmlString) {
        console.log('📄 Parsing MusicXML, length:', xmlString?.length);
        this.xmlDoc = new DOMParser().parseFromString(xmlString, 'text/xml');
        
        // Check for parsing errors
        const parserError = this.xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('❌ XML parsing error:', parserError.textContent);
        }
        
        this.parseScoreData();
        console.log('📄 Parsed score data:', {
            title: this.scoreData?.title,
            parts: this.scoreData?.parts?.length,
            tempo: this.scoreData?.tempo
        });
        return this.scoreData;
    }

    /**
     * Parse the XML document into structured data
     */
    parseScoreData() {
        console.log('📊 parseScoreData called');
        
        if (!this.xmlDoc) {
            console.error('❌ No XML document to parse');
            return null;
        }

        const scorePartwise = this.xmlDoc.querySelector('score-partwise');
        if (!scorePartwise) {
            // Try timewise format
            const scoreTimewise = this.xmlDoc.querySelector('score-timewise');
            if (scoreTimewise) {
                console.warn('⚠️ Timewise format detected, conversion needed');
            } else {
                console.error('❌ No score-partwise or score-timewise element found');
            }
            return null;
        }

        console.log('✓ Found score-partwise element');

        this.scoreData = {
            title: this.getTextContent('work-title') || 'Untitled',
            composer: this.getTextContent('creator[type="composer"]') || '',
            parts: [],
            tempo: 120,
            timeSignature: { beats: 4, beatType: 4 },
            keySignature: 0
        };
        
        console.log('📊 Initial score data:', this.scoreData.title);

        // Parse tempo
        const metronome = this.xmlDoc.querySelector('metronome per-minute');
        if (metronome) {
            this.scoreData.tempo = parseInt(metronome.textContent) || 120;
        }

        // Parse parts
        const parts = this.xmlDoc.querySelectorAll('part');
        parts.forEach((part, partIndex) => {
            const partData = {
                id: part.getAttribute('id'),
                name: this.getPartName(part.getAttribute('id')),
                measures: []
            };

            const measures = part.querySelectorAll('measure');
            measures.forEach((measure, measureIndex) => {
                const measureData = {
                    number: parseInt(measure.getAttribute('number')) || measureIndex + 1,
                    notes: [],
                    attributes: null
                };

                // Parse attributes (key, time, clef)
                const attributes = measure.querySelector('attributes');
                if (attributes) {
                    measureData.attributes = {
                        divisions: parseInt(attributes.querySelector('divisions')?.textContent) || 4,
                        key: parseInt(attributes.querySelector('key fifths')?.textContent) || 0,
                        time: {
                            beats: parseInt(attributes.querySelector('time beats')?.textContent) || 4,
                            beatType: parseInt(attributes.querySelector('time beat-type')?.textContent) || 4
                        },
                        clef: {
                            sign: attributes.querySelector('clef sign')?.textContent || 'G',
                            line: parseInt(attributes.querySelector('clef line')?.textContent) || 2
                        }
                    };

                    // Update global time/key from first measure
                    if (measureIndex === 0) {
                        this.scoreData.timeSignature = measureData.attributes.time;
                        this.scoreData.keySignature = measureData.attributes.key;
                    }
                }

                // Parse notes
                const notes = measure.querySelectorAll('note');
                notes.forEach((note, noteIndex) => {
                    const noteData = this.parseNote(note, noteIndex);
                    if (noteData) {
                        measureData.notes.push(noteData);
                    }
                });

                partData.measures.push(measureData);
            });

            this.scoreData.parts.push(partData);
        });

        return this.scoreData;
    }

    /**
     * Parse a single note element
     */
    parseNote(noteElement, index) {
        const isRest = noteElement.querySelector('rest') !== null;
        const isChord = noteElement.querySelector('chord') !== null;

        const noteData = {
            id: `note-${index}-${Date.now()}`,
            isRest,
            isChord,
            duration: parseInt(noteElement.querySelector('duration')?.textContent) || 4,
            type: noteElement.querySelector('type')?.textContent || 'quarter',
            voice: parseInt(noteElement.querySelector('voice')?.textContent) || 1,
            staff: parseInt(noteElement.querySelector('staff')?.textContent) || 1
        };

        if (!isRest) {
            const pitch = noteElement.querySelector('pitch');
            if (pitch) {
                noteData.pitch = {
                    step: pitch.querySelector('step')?.textContent || 'C',
                    octave: parseInt(pitch.querySelector('octave')?.textContent) || 4,
                    alter: parseInt(pitch.querySelector('alter')?.textContent) || 0
                };
            }
        }

        // Parse articulations
        const articulations = noteElement.querySelector('articulations');
        if (articulations) {
            noteData.articulations = [];
            if (articulations.querySelector('staccato')) noteData.articulations.push('staccato');
            if (articulations.querySelector('accent')) noteData.articulations.push('accent');
            if (articulations.querySelector('tenuto')) noteData.articulations.push('tenuto');
        }

        // Parse ties
        const ties = noteElement.querySelectorAll('tie');
        if (ties.length > 0) {
            noteData.ties = Array.from(ties).map(t => t.getAttribute('type'));
        }

        // Parse dots
        const dots = noteElement.querySelectorAll('dot');
        noteData.dots = dots.length;

        return noteData;
    }

    /**
     * Add a note to a specific measure and position
     */
    addNote(partIndex, measureNumber, noteData) {
        if (!this.xmlDoc) {
            console.error('No XML document available');
            return false;
        }

        // Find the part in XML
        const parts = this.xmlDoc.querySelectorAll('part');
        if (!parts[partIndex]) {
            console.error(`Part ${partIndex} not found`);
            return false;
        }

        // Find the measure in XML
        const measures = parts[partIndex].querySelectorAll('measure');
        const targetMeasure = Array.from(measures).find(
            m => parseInt(m.getAttribute('number')) === measureNumber
        );
        
        if (!targetMeasure) {
            console.error(`Measure ${measureNumber} not found in part ${partIndex}`);
            return false;
        }

        // Remove whole rest if this is the first note in an empty measure
        const wholeRest = targetMeasure.querySelector('note rest[measure=\"yes\"]');
        if (wholeRest) {
            wholeRest.parentElement.remove();
        }

        // Create note element
        const noteEl = this.xmlDoc.createElement('note');

        if (noteData.isRest) {
            const restEl = this.xmlDoc.createElement('rest');
            noteEl.appendChild(restEl);
        } else if (noteData.pitch) {
            // Add pitch
            const pitchEl = this.xmlDoc.createElement('pitch');
            
            const stepEl = this.xmlDoc.createElement('step');
            stepEl.textContent = noteData.pitch.step || 'C';
            pitchEl.appendChild(stepEl);

            if (noteData.pitch.alter) {
                const alterEl = this.xmlDoc.createElement('alter');
                alterEl.textContent = noteData.pitch.alter.toString();
                pitchEl.appendChild(alterEl);
            }

            const octaveEl = this.xmlDoc.createElement('octave');
            octaveEl.textContent = (noteData.pitch.octave || 4).toString();
            pitchEl.appendChild(octaveEl);

            noteEl.appendChild(pitchEl);
        }

        // Add duration
        const durationEl = this.xmlDoc.createElement('duration');
        durationEl.textContent = (noteData.duration || 4).toString();
        noteEl.appendChild(durationEl);

        // Add type
        const typeEl = this.xmlDoc.createElement('type');
        typeEl.textContent = noteData.type || 'quarter';
        noteEl.appendChild(typeEl);

        // Append to measure
        targetMeasure.appendChild(noteEl);

        // Re-parse to update scoreData
        this.parseScoreData();

        console.log(`✅ Added note to part ${partIndex}, measure ${measureNumber}`);
        return true;
    }

    /**
     * Remove a note by ID
     */
    removeNote(noteId) {
        if (!this.scoreData) return false;

        for (const part of this.scoreData.parts) {
            for (const measure of part.measures) {
                const index = measure.notes.findIndex(n => n.id === noteId);
                if (index !== -1) {
                    measure.notes.splice(index, 1);
                    this.updateXMLFromData();
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Update a note's properties
     */
    updateNote(noteId, updates) {
        if (!this.scoreData) return false;

        for (const part of this.scoreData.parts) {
            for (const measure of part.measures) {
                const note = measure.notes.find(n => n.id === noteId);
                if (note) {
                    Object.assign(note, updates);
                    this.updateXMLFromData();
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Regenerate XML from score data
     */
    updateXMLFromData() {
        if (!this.scoreData) return;
        // This would rebuild the XML document from scoreData
        // For now, we'll regenerate on export
    }

    /**
     * Export to MusicXML string
     */
    exportToXML() {
        if (!this.scoreData) return null;

        let partsXml = '';
        let partListXml = '';

        this.scoreData.parts.forEach((part, index) => {
            const partId = part.id || `P${index + 1}`;

            partListXml += `
        <score-part id="${partId}">
            <part-name>${this.escapeXml(part.name)}</part-name>
        </score-part>`;

            let measuresXml = '';
            part.measures.forEach((measure, mIndex) => {
                let measureContent = '';

                // Add attributes for first measure
                if (mIndex === 0 && measure.attributes) {
                    const attr = measure.attributes;
                    measureContent += `
            <attributes>
                <divisions>${attr.divisions}</divisions>
                <key>
                    <fifths>${attr.key}</fifths>
                </key>
                <time>
                    <beats>${attr.time.beats}</beats>
                    <beat-type>${attr.time.beatType}</beat-type>
                </time>
                <clef>
                    <sign>${attr.clef.sign}</sign>
                    <line>${attr.clef.line}</line>
                </clef>
            </attributes>`;
                }

                // Add notes
                if (measure.notes.length === 0) {
                    // Add whole rest if empty
                    const divisions = measure.attributes?.divisions || 4;
                    const beats = measure.attributes?.time?.beats || 4;
                    measureContent += `
            <note>
                <rest measure="yes"/>
                <duration>${divisions * beats}</duration>
                <type>whole</type>
            </note>`;
                } else {
                    measure.notes.forEach(note => {
                        measureContent += this.noteToXML(note);
                    });
                }

                measuresXml += `
        <measure number="${measure.number}">${measureContent}
        </measure>`;
            });

            partsXml += `
    <part id="${partId}">${measuresXml}
    </part>`;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
    <work>
        <work-title>${this.escapeXml(this.scoreData.title)}</work-title>
    </work>
    <identification>
        <creator type="composer">${this.escapeXml(this.scoreData.composer)}</creator>
        <encoding>
            <software>CounterpointAI</software>
            <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>
        </encoding>
    </identification>
    <part-list>${partListXml}
    </part-list>${partsXml}
</score-partwise>`;
    }

    /**
     * Convert a note object to XML string
     */
    noteToXML(note) {
        let xml = '\n            <note>';

        if (note.isChord) {
            xml += '\n                <chord/>';
        }

        if (note.isRest) {
            xml += '\n                <rest/>';
        } else if (note.pitch) {
            xml += `
                <pitch>
                    <step>${note.pitch.step}</step>`;
            if (note.pitch.alter !== 0) {
                xml += `
                    <alter>${note.pitch.alter}</alter>`;
            }
            xml += `
                    <octave>${note.pitch.octave}</octave>
                </pitch>`;
        }

        xml += `
                <duration>${note.duration}</duration>
                <type>${note.type}</type>`;

        if (note.dots > 0) {
            for (let i = 0; i < note.dots; i++) {
                xml += '\n                <dot/>';
            }
        }

        if (note.voice) {
            xml += `\n                <voice>${note.voice}</voice>`;
        }

        if (note.ties && note.ties.length > 0) {
            note.ties.forEach(tie => {
                xml += `\n                <tie type="${tie}"/>`;
            });
        }

        if (note.articulations && note.articulations.length > 0) {
            xml += '\n                <notations>\n                    <articulations>';
            note.articulations.forEach(art => {
                xml += `\n                        <${art}/>`;
            });
            xml += '\n                    </articulations>\n                </notations>';
        }

        xml += '\n            </note>';
        return xml;
    }

    /**
     * Helper: Get text content of first matching element
     */
    getTextContent(selector) {
        const element = this.xmlDoc.querySelector(selector);
        return element ? element.textContent : null;
    }

    /**
     * Helper: Get part name from part-list
     */
    getPartName(partId) {
        const scorePart = this.xmlDoc.querySelector(`score-part[id="${partId}"]`);
        if (scorePart) {
            const partName = scorePart.querySelector('part-name');
            return partName ? partName.textContent : partId;
        }
        return partId;
    }

    /**
     * Helper: Convert key name to fifths value
     */
    keyToFifths(key) {
        const keyMap = {
            'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'Gb': -6,
            'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Cb': -7,
            'Am': 0, 'Em': 1, 'Bm': 2, 'F#m': 3, 'C#m': 4, 'G#m': 5,
            'Dm': -1, 'Gm': -2, 'Cm': -3, 'Fm': -4, 'Bbm': -5
        };
        return keyMap[key] || 0;
    }

    /**
     * Helper: Get instrument information
     */
    getInstrumentInfo(instrument) {
        const instruments = {
            piano: { name: 'Piano', midiProgram: 1, clef: 'G', clefLine: 2 },
            violin: { name: 'Violin', midiProgram: 41, clef: 'G', clefLine: 2 },
            viola: { name: 'Viola', midiProgram: 42, clef: 'C', clefLine: 3 },
            cello: { name: 'Cello', midiProgram: 43, clef: 'F', clefLine: 4 },
            contrabass: { name: 'Contrabass', midiProgram: 44, clef: 'F', clefLine: 4 },
            flute: { name: 'Flute', midiProgram: 74, clef: 'G', clefLine: 2 },
            oboe: { name: 'Oboe', midiProgram: 69, clef: 'G', clefLine: 2 },
            clarinet: { name: 'Clarinet', midiProgram: 72, clef: 'G', clefLine: 2 },
            bassoon: { name: 'Bassoon', midiProgram: 71, clef: 'F', clefLine: 4 },
            trumpet: { name: 'Trumpet', midiProgram: 57, clef: 'G', clefLine: 2 },
            horn: { name: 'French Horn', midiProgram: 61, clef: 'G', clefLine: 2 },
            trombone: { name: 'Trombone', midiProgram: 58, clef: 'F', clefLine: 4 },
            tuba: { name: 'Tuba', midiProgram: 59, clef: 'F', clefLine: 4 },
            timpani: { name: 'Timpani', midiProgram: 48, clef: 'F', clefLine: 4 },
            guitar: { name: 'Guitar', midiProgram: 25, clef: 'G', clefLine: 2 },
            voice: { name: 'Voice', midiProgram: 53, clef: 'G', clefLine: 2 },
            soprano: { name: 'Soprano', midiProgram: 53, clef: 'G', clefLine: 2 },
            alto: { name: 'Alto', midiProgram: 53, clef: 'G', clefLine: 2 },
            tenor: { name: 'Tenor', midiProgram: 53, clef: 'G', clefLine: 2 },
            bass: { name: 'Bass', midiProgram: 53, clef: 'F', clefLine: 4 }
        };
        return instruments[instrument] || instruments.piano;
    }

    /**
     * Helper: Escape XML special characters
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
     * Add a new part/instrument to the score by injecting into XML DOM
     */
    addPart(instrumentName = 'piano', partName = null) {
        if (!this.xmlDoc) {
            console.error('No XML document available');
            return false;
        }

        const instrumentInfo = this.getInstrumentInfo(instrumentName);
        const existingParts = this.xmlDoc.querySelectorAll('part');
        const existingPartCount = existingParts.length;
        const newPartId = `P${existingPartCount + 1}`;
        
        // Get reference part for structure
        const referencePart = existingParts[0];
        if (!referencePart) {
            console.error('No reference part found');
            return false;
        }

        // Get attributes from first measure of reference part
        const firstMeasure = referencePart.querySelector('measure');
        const attributes = firstMeasure?.querySelector('attributes');
        const divisions = attributes?.querySelector('divisions')?.textContent || '4';
        const keyFifths = attributes?.querySelector('key fifths')?.textContent || '0';
        const timeBeats = attributes?.querySelector('time beats')?.textContent || '4';
        const timeBeatType = attributes?.querySelector('time beat-type')?.textContent || '4';

        // Count measures
        const measureCount = referencePart.querySelectorAll('measure').length;

        // Add to part-list in XML
        const partList = this.xmlDoc.querySelector('part-list');
        const newScorePart = this.xmlDoc.createElement('score-part');
        newScorePart.setAttribute('id', newPartId);
        
        const partNameEl = this.xmlDoc.createElement('part-name');
        partNameEl.textContent = partName || instrumentInfo.name;
        newScorePart.appendChild(partNameEl);
        
        partList.appendChild(newScorePart);

        // Create new part element with empty measures
        const newPartEl = this.xmlDoc.createElement('part');
        newPartEl.setAttribute('id', newPartId);

        for (let i = 1; i <= measureCount; i++) {
            const measureEl = this.xmlDoc.createElement('measure');
            measureEl.setAttribute('number', i.toString());

            // Add attributes to first measure
            if (i === 1) {
                const attrsEl = this.xmlDoc.createElement('attributes');
                
                const divsEl = this.xmlDoc.createElement('divisions');
                divsEl.textContent = divisions;
                attrsEl.appendChild(divsEl);

                const keyEl = this.xmlDoc.createElement('key');
                const fifthsEl = this.xmlDoc.createElement('fifths');
                fifthsEl.textContent = keyFifths;
                keyEl.appendChild(fifthsEl);
                attrsEl.appendChild(keyEl);

                const timeEl = this.xmlDoc.createElement('time');
                const beatsEl = this.xmlDoc.createElement('beats');
                beatsEl.textContent = timeBeats;
                const beatTypeEl = this.xmlDoc.createElement('beat-type');
                beatTypeEl.textContent = timeBeatType;
                timeEl.appendChild(beatsEl);
                timeEl.appendChild(beatTypeEl);
                attrsEl.appendChild(timeEl);

                const clefEl = this.xmlDoc.createElement('clef');
                const signEl = this.xmlDoc.createElement('sign');
                signEl.textContent = instrumentInfo.clef;
                const lineEl = this.xmlDoc.createElement('line');
                lineEl.textContent = instrumentInfo.clefLine.toString();
                clefEl.appendChild(signEl);
                clefEl.appendChild(lineEl);
                attrsEl.appendChild(clefEl);

                measureEl.appendChild(attrsEl);
            }

            // Add whole rest
            const noteEl = this.xmlDoc.createElement('note');
            const restEl = this.xmlDoc.createElement('rest');
            restEl.setAttribute('measure', 'yes');
            noteEl.appendChild(restEl);
            
            const durEl = this.xmlDoc.createElement('duration');
            durEl.textContent = (parseInt(divisions) * parseInt(timeBeats)).toString();
            noteEl.appendChild(durEl);
            
            const typeEl = this.xmlDoc.createElement('type');
            typeEl.textContent = 'whole';
            noteEl.appendChild(typeEl);
            
            measureEl.appendChild(noteEl);
            newPartEl.appendChild(measureEl);
        }

        // Add new part to document
        const scorePartwise = this.xmlDoc.querySelector('score-partwise');
        scorePartwise.appendChild(newPartEl);

        // Re-parse to update scoreData
        this.parseScoreData();
        
        console.log(`✅ Added new part: ${partName || instrumentInfo.name} (${instrumentName}) with ${measureCount} measures`);
        return { partIndex: existingPartCount, partId: newPartId, measureCount };
    }

    /**
     * Get score data
     */
    getScoreData() {
        return this.scoreData;
    }

    /**
     * Set score data directly
     */
    setScoreData(data) {
        this.scoreData = data;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MusicXMLGenerator;
}
