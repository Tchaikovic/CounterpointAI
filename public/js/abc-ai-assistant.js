/**
 * ABC AI Assistant - Handles AI communication with ABC notation focus
 */
class ABCAIAssistant {
    constructor() {
        this.model = localStorage.getItem('openrouter_model') || 'anthropic/claude-3.5-sonnet-20241022';
        this.conversationHistory = [];
        this.scoreEditor = null;
        this.isProcessing = false;

        // System prompt for ABC music editing
        this.systemPrompt = `You are an expert music composition assistant. Output ONLY valid ABC notation code, nothing else.

CRITICAL RULES:
1. NEVER write explanations, descriptions, or analysis
2. NEVER write "Here is" or "Step 1" or markdown headings
3. OUTPUT ONLY the ABC notation code block
4. NO text before or after the code block
5. When adding to existing music, output ONLY the NEW voice part
6. Do NOT repeat the entire score - only output what needs to be ADDED

ABC NOTATION FORMAT:
Headers:
- X:1 (reference number)
- T:Title
- C:Composer
- M:4/4 (time signature)
- L:1/4 (default note length)
- K:C (key signature)
- V:PartName (voice declaration)

Notes:
- C D E F G A B (octave 4)
- c d e f g a b (octave 5)
- C, D, E, (octave 3)
- ^C (sharp), _D (flat), =E (natural)

Durations:
- C (quarter), C2 (half), C4 (whole)
- C/ (eighth), C// (sixteenth)
- C3/2 (dotted quarter)

Bars: | (bar line), |] (final bar), |: :| (repeat)
Rests: z (rest, e.g., z2 for half rest)
Chords: [CEG] (notes together)

EXAMPLE OUTPUT (this is the ONLY acceptable format):
\`\`\`abc
X:1
T:Viola Part
V:Viola clef=alto
M:4/4
L:1/8
K:G
|: D2 B,2 D2 G2 | E2 C2 E2 A2 | F2 D2 F2 B2 | G4 G4 :|
\`\`\`

Remember: Output ABC code ONLY. No explanations whatsoever.`;
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
            // Get current ABC score context
            const { abc: currentABC } = this.scoreEditor ? this.scoreEditor.getScoreData() : { abc: '' };
            
            console.log('📊 Current ABC for AI:', {
                hasABC: !!currentABC,
                length: currentABC ? currentABC.length : 0,
                model: this.model
            });

            // Build messages array
            const messages = [
                { role: 'system', content: this.systemPrompt },
                ...this.conversationHistory.slice(-10), // Keep last 10 messages
            ];

            // Add current ABC context if available
            if (currentABC) {
                messages.push({
                    role: 'user',
                    content: `Current score (DO NOT REPEAT THIS):\n\`\`\`abc\n${currentABC.substring(0, 500)}...\n\`\`\`\n\nCRITICAL: Output ONLY the new voice part. Format:\n\`\`\`abc\nV:PartName clef=alto\n(new music notes only)\n\`\`\`\n\nDo NOT output X:, T:, M:, L:, or K: headers. Do NOT repeat existing voices.`
                });
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
                    messages: messages,
                    max_tokens: 8000  // Limit response to 8000 tokens for ABC notation
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

            // Save to conversation history
            this.conversationHistory.push({ role: 'user', content: userMessage });
            this.conversationHistory.push({ role: 'assistant', content: assistantMessage });
            
            // Parse and apply ABC if present
            const abc = this.extractABC(assistantMessage);
            if (abc && this.scoreEditor) {
                console.log('🎵 Adding new ABC part to score...');
                try {
                    this.scoreEditor.addPart(abc);
                    console.log('✅ ABC part added successfully');
                } catch (error) {
                    console.error('❌ Error adding ABC part:', error);
                    throw new Error(`Failed to add ABC part: ${error.message}`);
                }
            }

            return {
                message: assistantMessage,
                abc: abc
            };

        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Extract ABC notation from AI response
     */
    extractABC(message) {
        // Try to find ABC code blocks
        const abcRegex = /```abc\s*([\s\S]*?)\s*```/g;
        const match = abcRegex.exec(message);
        
        if (match) {
            console.log('📝 Found ABC notation block');
            const abc = match[1].trim();
            
            // Validate that it starts with ABC headers
            if (abc.match(/^X:\d+/m) || abc.match(/^V:/m)) {
                return abc;
            }
        }
        
        // Try generic code blocks
        const codeRegex = /```\s*([\s\S]*?)\s*```/g;
        const codeMatch = codeRegex.exec(message);
        
        if (codeMatch) {
            const code = codeMatch[1].trim();
            if (code.match(/^X:\d+/m) || code.match(/^V:/m)) {
                console.log('📝 Found ABC notation in generic code block');
                return code;
            }
        }
        
        // Look for ABC notation without code blocks
        if (message.match(/^[XV]:/m)) {
            console.log('📝 Found raw ABC notation');
            return message.trim();
        }
        
        console.warn('⚠️ No valid ABC notation found in response');
        return null;
    }

    /**
     * Format AI response for display
     */
    formatResponse(response) {
        if (response.abc) {
            // Count lines in ABC notation
            const lines = response.abc.split('\n').filter(l => l.trim()).length;
            return `✅ ABC notation added (${lines} lines)`;
        }
        
        // Check if response contains explanatory text instead of ABC
        const message = response.message || response;
        if (message.length > 200 && !message.includes('```abc')) {
            return '⚠️ AI generated explanation instead of ABC code. Please try asking more specifically for ABC notation.';
        }
        
        // Remove ABC blocks for display
        let displayText = message;
        displayText = displayText.replace(/```abc[\s\S]*?```/g, '[ABC notation applied]');
        displayText = displayText.replace(/```[\s\S]*?```/g, '[Code block]');
        
        return displayText.trim() || '✅ Response received';
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
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ABCAIAssistant;
}
