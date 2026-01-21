/**
 * ABC Playback Engine - Handles audio playback from ABC notation
 */
class ABCPlayback {
    constructor() {
        this.synthControl = null;
        this.isPlaying = false;
        this.cursorControl = null;
    }

    /**
     * Set the score editor
     */
    setScoreEditor(editor) {
        this.scoreEditor = editor;
    }

    /**
     * Initialize playback with abcjs synthesizer
     */
    async init(visualObj, audioDivOrSelector) {
        if (!visualObj) {
            console.error('No visual object for playback');
            return;
        }

        // Handle array of visual objects
        const tune = Array.isArray(visualObj) ? visualObj[0] : visualObj;
        if (!tune) {
            console.error('Invalid visual object');
            return;
        }

        try {
            // Create synth control
            if (ABCJS.synth.supportsAudio()) {
                this.synthControl = new ABCJS.synth.SynthController();
                
                // Use provided div or default to abcAudio
                const selector = audioDivOrSelector ? 
                    (typeof audioDivOrSelector === 'string' ? audioDivOrSelector : '#' + audioDivOrSelector.id) :
                    '#abcAudio';
                
                await this.synthControl.load(selector, 
                    this.createCursorControl(), 
                    {
                        displayLoop: true,
                        displayRestart: true,
                        displayPlay: true,
                        displayProgress: true,
                        displayWarp: true
                    }
                );

                await this.synthControl.setTune(tune, false);
                console.log('✅ ABC playback initialized');
            } else {
                console.warn('⚠️ Audio not supported in this browser');
            }
        } catch (error) {
            console.error('❌ Failed to initialize playback:', error);
        }
    }

    /**
     * Create cursor control for visual feedback
     */
    createCursorControl() {
        const self = this;
        return {
            beatSubdivisions: 2,
            onStart: function() {
                self.isPlaying = true;
            },
            onFinished: function() {
                self.isPlaying = false;
            },
            onBeat: function(beatNumber, totalBeats, totalTime) {
                // Visual feedback during playback
            },
            onEvent: function(ev) {
                // Handle playback events
            }
        };
    }

    /**
     * Play the current score
     */
    play() {
        if (this.synthControl) {
            this.synthControl.play();
            this.isPlaying = true;
        }
    }

    /**
     * Pause playback
     */
    pause() {
        if (this.synthControl) {
            this.synthControl.pause();
            this.isPlaying = false;
        }
    }

    /**
     * Stop playback
     */
    stop() {
        if (this.synthControl) {
            this.synthControl.stop();
            this.isPlaying = false;
        }
    }

    /**
     * Toggle play/pause
     */
    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Seek to position (0-1)
     */
    seek(position) {
        if (this.synthControl) {
            this.synthControl.seek(position);
        }
    }

    /**
     * Set playback speed
     */
    setSpeed(speed) {
        if (this.synthControl) {
            this.synthControl.setSpeed(speed);
        }
    }

    /**
     * Check if playing
     */
    getPlayState() {
        return this.isPlaying;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ABCPlayback;
}
