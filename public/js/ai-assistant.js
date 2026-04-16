/**
 * AI Assistant - Handles communication with OpenRouter for music modification
 */
class AIAssistant {
    constructor() {
        this.model = localStorage.getItem('openrouter_model') || 'anthropic/claude-3.5-sonnet';
        this.conversationHistory = [];
        this.scoreEditor = null;
        this.isProcessing = false;

        // System prompt for music editing
        this.systemPrompt = `You are an expert music composition and notation assistant integrated into a music notation editor called CounterpointAI. Your role is to help users modify, improve, and create music using ABC notation format.

CRITICAL RULES:
1. NEVER modify, delete, or change existing parts unless explicitly requested
2. When adding a new part, output COMPLETE ABC notation for the entire piece
3. Preserve the key signature, time signature, and tempo unless explicitly asked to change them
4. Use ABC notation format - it's compact and expressive
5. DO NOT explain what you would do - OUTPUT THE ACTUAL ABC NOTATION
6. Your response MUST contain valid ABC notation, not descriptions or explanations

ABC NOTATION FORMAT:
When the user asks to add a new instrument/part, output ABC notation for the complete part.

ABC notation basics:
- X:1 = tune number
- T:Title = tune title
- V:PartName = voice/part declaration (e.g., V:Violin)
- M:4/4 = meter (time signature)
- L:1/4 = default note length
- K:C = key signature
- Notes: C D E F G A B c d e f g a b (lowercase = higher octave)
- Accidentals: ^ = sharp, _ = flat, = = natural
- Durations: C2 = half note, C = quarter, C/2 = eighth, C/4 = sixteenth
- Rests: z = rest (z2 = half rest, z = quarter rest)
- Bar lines: | = bar line, |] = end
- Repeats: |: ... :| = repeat section

Example - Adding a violin part to an existing score:
\`\`\`abc
V:Violin
%%MIDI program 40
M:4/4
L:1/4
K:F
|: F A c f | e d c2 | d f a g | f4 :|
|: c e g c' | a g f2 | e f g a | f4 :|
\`\`\`

For long pieces (100+ measures), you can use:
- Section markers: |: ... :| for repeated sections
- Part markers: P:A, P:B for different sections
- Repeat notation to avoid writing everything out

OUTPUT FORMAT:
Your response must be ABC notation in a code block:
\`\`\`abc
V:InstrumentName
... (complete ABC notation for the part)
\`\`\`

The system will parse your ABC notation and convert it to the internal format.

When analyzing the score:
- You receive a summary of the existing score with key/time/tempo
- Analyze the harmonic progression and create complementary music
- Use ABC repeat notation for long pieces (|: ... :|)
- Create musically coherent phrases that fit the style

IMPORTANT:
- Output ONLY the ABC notation in a code block
- Do NOT explain what you're doing
- Do NOT include the existing score
- Just the new part in ABC format

The user will see the new part added to their score immediately.`;
    }

    /**
     * Set the score editor reference
     */
    setScoreEditor(editor) {
        this.scoreEditor = editor;
    }

    /**
     * Set model
     */
    setModel(model) {
        this.model = model;
        localStorage.setItem('openrouter_model', model);
    }

    /**
     * Get model
     */
    getModel() {
        return this.model;
    }

    /**
     * Check if API key is configured
     */
    isConfigured() {
        return true;
    }

    /**
     * Send a message to the AI
     */
    async sendMessage(userMessage) {
        if (this.isProcessing) {
            throw new Error('Already processing a request');
        }

        this.isProcessing = true;

        try {
            // Get current score context
            const scoreContext = this.getScoreContext();
            console.log('📊 Score context for AI:', {
                hasContext: !!scoreContext,
                contextLength: scoreContext?.length || 0,
                model: this.model
            });

            // Build messages array
            const messages = [
                { role: 'system', content: this.systemPrompt },
                ...this.conversationHistory.slice(-10), // Keep last 10 messages for context
            ];

            // Add score context if available
            if (scoreContext) {
                const contextMessage = `Current score context (complete):\n${scoreContext}`;
                messages.push({
                    role: 'user',
                    content: contextMessage
                });
                console.log('📊 Full score sent:', contextMessage.substring(0, 500) + '...');
            }

            // Add user message
            messages.push({ role: 'user', content: userMessage });

            // Make API request
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'API request failed');
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message || 'API error');
            }

            const assistantMessage = data.choices?.[0]?.message?.content || 'No response received';

            // Parse and apply modifications if present
            const modifications = this.parseModifications(assistantMessage);
            
            // Check if the AI generated a complete part
            if (modifications.length > 0) {
                const hasAddPart = modifications.some(m => m.type === 'addPart');
                const addNoteCount = modifications.filter(m => m.type === 'addNote').length;
                
                if (hasAddPart && addNoteCount < 50) {
                    console.warn(`⚠️ AI only generated ${addNoteCount} notes for a new part. This is likely incomplete.`);
                    
                    // Get the score context to check total measures
                    if (scoreContext) {
                        try {
                            const contextObj = JSON.parse(scoreContext);
                            const totalMeasures = contextObj.totalMeasures || 0;
                            
                            if (totalMeasures > 100 && addNoteCount < totalMeasures * 0.5) {
                                console.error(`❌ INCOMPLETE GENERATION: Only ${addNoteCount} notes for ${totalMeasures} measures. Rejecting.`);
                                throw new Error(`The AI only generated ${addNoteCount} notes for a ${totalMeasures}-measure piece. This is incomplete. Please try again with a more specific request, or try a different model like Claude Opus 4.5 or o1.`);
                            }
                        } catch (e) {
                            // Couldn't parse context, continue anyway
                        }
                    }
                }
            }

            // Save to conversation history
            this.conversationHistory.push({ role: 'user', content: userMessage });
            this.conversationHistory.push({ role: 'assistant', content: assistantMessage });
            
            // Extend pattern if needed for long pieces
            if (modifications.length > 0 && scoreContext) {
                try {
                    const contextObj = JSON.parse(scoreContext);
                    const totalMeasures = contextObj.totalMeasures || 0;
                    modifications = this.extendPattern(modifications, totalMeasures);
                } catch (e) {
                    console.warn('Could not extend pattern:', e);
                }
            }
            
            // Apply modifications to score
            if (modifications.length > 0 && this.scoreEditor) {
                console.log(`🎵 Applying ${modifications.length} modifications to score...`);
                try {
                    await this.scoreEditor.applyModifications(modifications);
                    console.log('✅ Modifications applied successfully');
                } catch (error) {
                    console.error('❌ Error applying modifications:', error);
                    throw new Error(`Failed to apply modifications: ${error.message}`);
                }
            } else if (modifications.length > 0 && !this.scoreEditor) {
                console.error('❌ No score editor available to apply modifications');
            }

            return {
                message: assistantMessage,
                modifications: modifications
            };

        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Get score context for AI
     */
    getScoreContext() {
        if (!this.scoreEditor) return null;

        const scoreData = this.scoreEditor.getScoreData();
        if (!scoreData) return null;

        // Create comprehensive context with ALL measures
        const context = {
            title: scoreData.title,
            composer: scoreData.composer,
            tempo: scoreData.tempo,
            timeSignature: scoreData.timeSignature,
            keySignature: this.fifthsToKeyName(scoreData.keySignature),
            totalMeasures: scoreData.parts[0]?.measures.length || 0,
            parts: scoreData.parts.map(part => ({
                name: part.name,
                measureCount: part.measures.length,
                // Include ALL measures with all notes
                measures: part.measures.map(m => ({
                    number: m.number,
                    noteCount: m.notes.length,
                    notes: m.notes.map(n => ({
                        pitch: n.isRest ? 'rest' : `${n.pitch?.step}${n.pitch?.alter ? (n.pitch.alter === 1 ? '#' : 'b') : ''}${n.pitch?.octave}`,
                        duration: n.duration,
                        type: n.type,
                        isChord: n.isChord || false
                    }))
                }))
            }))
        };

        return JSON.stringify(context, null, 2);
    }

    /**
     * Convert fifths to key name
     */
    fifthsToKeyName(fifths) {
        const keys = {
            '-7': 'C♭ major', '-6': 'G♭ major', '-5': 'D♭ major', '-4': 'A♭ major',
            '-3': 'E♭ major', '-2': 'B♭ major', '-1': 'F major', '0': 'C major',
            '1': 'G major', '2': 'D major', '3': 'A major', '4': 'E major',
            '5': 'B major', '6': 'F♯ major', '7': 'C♯ major'
        };
        return keys[fifths?.toString()] || 'C major';
    }

    /**
     * Parse modifications from AI response (supports both JSON and ABC notation)
     */
    parseModifications(message) {
        const modifications = [];

        // First, check for ABC notation
        const abcRegex = /```abc\s*([\s\S]*?)\s*```/g;
        let match = abcRegex.exec(message);
        
        if (match) {
            console.log('📝 Found ABC notation block');
            try {
                const abcParser = new ABCParser();
                const abcMods = abcParser.parseABC(match[1]);
                
                // Fix partIndex to be the actual next part index
                const scoreData = this.scoreEditor?.getScoreData();
                const nextPartIndex = scoreData ? scoreData.parts.length : 2;
                
                for (const mod of abcMods) {
                    if (mod.partIndex === 'last') {
                        mod.partIndex = nextPartIndex;
                    }
                }
                
                console.log(`✅ Parsed ABC to ${abcMods.length} modifications`);
                return abcMods;
            } catch (e) {
                console.error('Failed to parse ABC notation:', e);
            }
        }

        // Fall back to JSON parsing
        // First, try to parse the entire message as JSON
        try {
            const json = JSON.parse(message.trim());
            if (json.modifications && Array.isArray(json.modifications)) {
                console.log(`Found modifications in direct JSON parse: ${json.modifications.length}`);
                return json.modifications;
            }
        } catch (e) {
            // Not pure JSON, continue with other methods
        }

        // Look for JSON blocks in markdown code blocks
        const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;

        while ((match = jsonRegex.exec(message)) !== null) {
            try {
                const json = JSON.parse(match[1]);
                if (json.modifications && Array.isArray(json.modifications)) {
                    console.log(`Found modifications in code block: ${json.modifications.length}`);
                    modifications.push(...json.modifications);
                }
            } catch (e) {
                console.warn('Failed to parse JSON modification block:', e);
            }
        }

        // Try to find the first complete JSON object with modifications
        const firstJsonMatch = message.match(/\{[\s\S]*?"modifications"[\s\S]*?\]/g);
        if (firstJsonMatch && modifications.length === 0) {
            for (const jsonStr of firstJsonMatch) {
                try {
                    // Try to complete the JSON if it's cut off
                    let completeJson = jsonStr;
                    if (!completeJson.endsWith('}')) {
                        completeJson += '}';
                    }
                    const json = JSON.parse(completeJson);
                    if (json.modifications && Array.isArray(json.modifications)) {
                        console.log(`Found modifications in inline JSON: ${json.modifications.length}`);
                        modifications.push(...json.modifications);
                        break; // Take only the first valid one
                    }
                } catch (e) {
                    // Continue trying
                }
            }
        }

        console.log(`Total modifications parsed: ${modifications.length}`);
        return modifications;
    }

    /**
     * Extend a pattern across all measures
     */
    extendPattern(modifications, totalMeasures) {
        const hasAddPart = modifications.some(m => m.type === 'addPart');
        if (!hasAddPart || totalMeasures <= 50) {
            return modifications; // No need to extend
        }

        const notes = modifications.filter(m => m.type === 'addNote');
        if (notes.length === 0) return modifications;

        // Find the pattern length (measures covered)
        const measures = [...new Set(notes.map(n => n.measureNumber))].sort((a, b) => a - b);
        const patternLength = measures.length;
        
        if (patternLength === 0 || measures[measures.length - 1] >= totalMeasures) {
            return modifications; // Already complete
        }

        console.log(`🔄 Extending ${patternLength}-measure pattern to ${totalMeasures} measures...`);

        const extended = [...modifications];
        const partIndex = notes[0].partIndex;

        // Repeat the pattern
        for (let targetMeasure = patternLength + 1; targetMeasure <= totalMeasures; targetMeasure++) {
            const sourceMeasure = ((targetMeasure - 1) % patternLength) + 1;
            const sourceNotes = notes.filter(n => n.measureNumber === sourceMeasure);
            
            sourceNotes.forEach(sourceNote => {
                extended.push({
                    type: 'addNote',
                    partIndex: partIndex,
                    measureNumber: targetMeasure,
                    noteData: { ...sourceNote.noteData }
                });
            });
        }

        console.log(`✅ Extended from ${notes.length} to ${extended.filter(m => m.type === 'addNote').length} notes`);
        return extended;
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
    }

    /**
     * Get conversation history
     */
    getHistory() {
        return this.conversationHistory;
    }

    /**
     * Generate a description of the current score
     */
    async describeScore() {
        const prompt = `Please analyze the current score and provide:
1. A brief description of the musical content
2. The overall structure and form
3. Key harmonic progressions
4. Notable rhythmic patterns
5. Suggestions for improvement or development`;

        return await this.sendMessage(prompt);
    }

    /**
     * Request AI to add a new part
     */
    async addPart(description) {
        const prompt = `Please add a new musical part to the score with the following characteristics: ${description}

Consider the existing parts and create something that complements them harmonically and rhythmically.`;

        return await this.sendMessage(prompt);
    }

    /**
     * Request AI to harmonize a melody
     */
    async harmonize(style = 'classical') {
        const prompt = `Please analyze the main melody in the score and add appropriate harmonization in ${style} style.

Consider:
- Voice leading principles
- Harmonic rhythm
- The key signature and common progressions
- Avoiding parallel fifths and octaves`;

        return await this.sendMessage(prompt);
    }

    /**
     * Request AI to transpose
     */
    async transpose(semitones) {
        const direction = semitones > 0 ? 'up' : 'down';
        const prompt = `Please transpose the entire score ${direction} by ${Math.abs(semitones)} semitones.`;

        return await this.sendMessage(prompt);
    }

    /**
     * Request AI to add ornamentation
     */
    async addOrnamentation(style = 'baroque') {
        const prompt = `Please add appropriate ornamentation to the score in ${style} style.

Consider adding:
- Trills
- Mordents
- Grace notes
- Appoggiaturas
- Turn figures

Only add ornamentation where it enhances the musical expression.`;

        return await this.sendMessage(prompt);
    }

    /**
     * Request AI to fill in missing parts
     */
    async fillMeasures(startMeasure, endMeasure, style = '') {
        const prompt = `Please compose music for measures ${startMeasure} through ${endMeasure}.
${style ? `Style/character: ${style}` : ''}

Consider the existing musical context and create a coherent continuation.`;

        return await this.sendMessage(prompt);
    }

    /**
     * Format AI response for display
     */
    formatResponse(response) {
        // If we have modifications, create a user-friendly message
        if (response.modifications && response.modifications.length > 0) {
            const mods = response.modifications;
            const addPartCount = mods.filter(m => m.type === 'addPart').length;
            const addNoteCount = mods.filter(m => m.type === 'addNote').length;
            const removeNoteCount = mods.filter(m => m.type === 'removeNote').length;
            const updateNoteCount = mods.filter(m => m.type === 'updateNote').length;
            
            let summary = '✅ Modifications applied:\n';
            if (addPartCount > 0) summary += `• Added ${addPartCount} new part(s)\n`;
            if (addNoteCount > 0) summary += `• Added ${addNoteCount} note(s)\n`;
            if (removeNoteCount > 0) summary += `• Removed ${removeNoteCount} note(s)\n`;
            if (updateNoteCount > 0) summary += `• Updated ${updateNoteCount} note(s)\n`;
            
            return summary.trim();
        }
        
        // Otherwise, remove JSON blocks for display
        let displayText = response.message || response;
        
        // Remove JSON modifications objects (with or without code blocks)
        displayText = displayText.replace(/```json[\s\S]*?```/g, '[Modifications applied]');
        displayText = displayText.replace(/```[\s\S]*?```/g, '');
        displayText = displayText.replace(/\{[\s\S]*?"modifications"[\s\S]*?\][\s\S]*?\}/g, '[Modifications applied]');
        
        return displayText.trim() || '✅ Modifications applied successfully';
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIAssistant;
}
