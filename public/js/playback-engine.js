/**
 * Playback Engine - Handles MIDI-like audio playback using Tone.js
 */
class PlaybackEngine {
    constructor() {
        this.isPlaying = false;
        this.isPaused = false;
        this.isLooping = false;
        this.tempo = 120;
        this.volume = 0.8;
        this.currentTime = 0;
        this.totalDuration = 0;
        this.notes = [];
        this.scheduledEvents = [];
        this.synths = {};
        this.initialized = false;
        this.scoreEditor = null;
        this.updateLoopId = null;

        // Callbacks
        this.onTimeUpdate = null;
        this.onPlayStateChange = null;
        this.onNotePlay = null;
    }

    /**
     * Initialize Tone.js and create instruments
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Wait for user interaction to start audio context
            await Tone.start();
            console.log('Audio context started');

            // Create polyphonic synths for different parts
            this.synths = {
                piano: new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: 'triangle' },
                    envelope: {
                        attack: 0.02,
                        decay: 0.1,
                        sustain: 0.3,
                        release: 0.8
                    }
                }).toDestination(),

                strings: new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: 'sawtooth' },
                    envelope: {
                        attack: 0.1,
                        decay: 0.2,
                        sustain: 0.5,
                        release: 1.0
                    }
                }).toDestination(),

                brass: new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: 'square' },
                    envelope: {
                        attack: 0.05,
                        decay: 0.1,
                        sustain: 0.4,
                        release: 0.5
                    }
                }).toDestination(),

                woodwind: new Tone.PolySynth(Tone.Synth, {
                    oscillator: { type: 'sine' },
                    envelope: {
                        attack: 0.08,
                        decay: 0.15,
                        sustain: 0.4,
                        release: 0.6
                    }
                }).toDestination()
            };

            // Set initial volume
            this.setVolume(this.volume);

            this.initialized = true;
            console.log('Playback engine initialized');
        } catch (error) {
            console.error('Failed to initialize playback engine:', error);
        }
    }

    /**
     * Set the score editor reference
     */
    setScoreEditor(editor) {
        this.scoreEditor = editor;
    }

    /**
     * Load notes from score editor
     */
    loadFromScore() {
        if (!this.scoreEditor) {
            console.warn('No score editor set');
            return;
        }

        console.log('🎵 Loading notes from score...');
        this.notes = this.scoreEditor.getNotesForPlayback();
        console.log(`🎵 Loaded ${this.notes.length} notes`);
        
        if (this.notes.length > 0) {
            console.log('🎵 First note:', JSON.stringify(this.notes[0]));
            console.log('🎵 Last note:', JSON.stringify(this.notes[this.notes.length - 1]));
            
            // Show first 3 notes for debugging
            console.log('🎵 First 3 notes:');
            for (let i = 0; i < Math.min(3, this.notes.length); i++) {
                console.log(`  ${i + 1}. ${this.notes[i].pitch} @ ${(this.notes[i].time/1000).toFixed(2)}s`);
            }
        } else {
            console.warn('⚠️ No notes extracted from score!');
        }
        
        this.calculateDuration();
        console.log(`🎵 Total duration: ${(this.totalDuration/1000).toFixed(2)} seconds (${this.totalDuration} ms)`);
    }

    /**
     * Load notes directly
     */
    loadNotes(notes) {
        this.notes = notes;
        this.calculateDuration();
    }

    /**
     * Calculate total duration
     */
    calculateDuration() {
        if (this.notes.length === 0) {
            this.totalDuration = 0;
            return;
        }

        let maxEndTime = 0;
        this.notes.forEach(note => {
            const endTime = note.time + note.duration;
            if (endTime > maxEndTime) {
                maxEndTime = endTime;
            }
        });

        this.totalDuration = maxEndTime;
    }

    /**
     * Set tempo (BPM)
     */
    setTempo(bpm) {
        this.tempo = Math.max(20, Math.min(300, bpm));
        Tone.Transport.bpm.value = this.tempo;
        return this.tempo;
    }

    /**
     * Set volume (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        
        // Convert to decibels (-60 to 0)
        const db = volume === 0 ? -Infinity : 20 * Math.log10(this.volume);
        
        Object.values(this.synths).forEach(synth => {
            if (synth && synth.volume) {
                synth.volume.value = db;
            }
        });

        return this.volume;
    }

    /**
     * Play the score
     */
    async play() {
        console.log('Play called');
        
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.notes.length === 0) {
            console.log('Loading notes from score...');
            this.loadFromScore();
        }

        if (this.notes.length === 0) {
            console.warn('No notes to play');
            alert('No notes to play. The score may be empty or not loaded properly.');
            return;
        }

        console.log('Playing', this.notes.length, 'notes');
        console.log('Total duration:', this.totalDuration, 'ms');
        console.log('First few notes:', this.notes.slice(0, 5));

        if (this.isPaused) {
            this.resume();
            return;
        }

        this.stop();
        this.isPlaying = true;
        this.isPaused = false;
        this.currentTime = 0;

        // Reset Transport to beginning
        Tone.Transport.seconds = 0;
        Tone.Transport.position = 0;
        
        // Set Transport BPM
        Tone.Transport.bpm.value = this.tempo;
        console.log('Set tempo to:', this.tempo, 'BPM');

        // Schedule all notes
        this.scheduleNotes();

        // Start transport at time 0
        Tone.Transport.start('+0.1');
        console.log('Transport started, state:', Tone.Transport.state);

        // Start time update loop
        this.startTimeUpdateLoop();
        console.log('Time update loop started');

        if (this.onPlayStateChange) {
            this.onPlayStateChange('playing');
        }
        
        console.log('Playback started, notes scheduled:', this.scheduledEvents.length);
    }

    /**
     * Schedule all notes for playback
     */
    scheduleNotes() {
        const synth = this.synths.piano;
        
        console.log('Scheduling notes...');

        this.notes.forEach((note, index) => {
            const noteTimeInSeconds = note.time / 1000;
            const noteDurationInSeconds = note.duration / 1000;
            const pitch = this.getPitchWithAlter(note.pitch, note.alter);

            // Schedule using Transport timeline (in seconds from start)
            const eventId = Tone.Transport.schedule((time) => {
                console.log(`Playing note ${index}:`, pitch, 'at', time);
                synth.triggerAttackRelease(
                    pitch,
                    noteDurationInSeconds,
                    time,
                    note.velocity || 0.7
                );

                if (this.onNotePlay) {
                    this.onNotePlay(note);
                }
            }, noteTimeInSeconds);

            this.scheduledEvents.push(eventId);
        });

        // Schedule end of playback
        if (this.totalDuration > 0) {
            const endEventId = Tone.Transport.schedule((time) => {
                console.log('Playback ended at', time);
                if (this.isLooping) {
                    this.currentTime = 0;
                    this.rewind();
                    this.play();
                } else {
                    this.stop();
                }
            }, this.totalDuration / 1000);
            
            this.scheduledEvents.push(endEventId);
        }
        
        console.log('Scheduled', this.scheduledEvents.length, 'events');
    }

    /**
     * Convert pitch with alter to frequency notation
     */
    getPitchWithAlter(pitchName, alter) {
        // pitchName format: "C4", "D5", etc.
        if (!pitchName || pitchName.length < 2) {
            console.warn('Invalid pitch name:', pitchName);
            return 'C4';
        }
        
        const note = pitchName.slice(0, -1);
        const octave = pitchName.slice(-1);
        
        // Validate octave is a number
        if (isNaN(octave)) {
            console.warn('Invalid octave in pitch:', pitchName);
            return pitchName;
        }
        
        // Handle alterations (sharps/flats)
        if (alter === 1) {
            return `${note}#${octave}`;
        } else if (alter === -1) {
            return `${note}b${octave}`;
        } else if (alter === 2) {
            return `${note}##${octave}`;
        } else if (alter === -2) {
            return `${note}bb${octave}`;
        }
        
        return pitchName;
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying) return;

        Tone.Transport.pause();
        this.isPlaying = false;
        this.isPaused = true;

        if (this.onPlayStateChange) {
            this.onPlayStateChange('paused');
        }
    }

    /**
     * Resume playback
     */
    resume() {
        if (!this.isPaused) return;

        Tone.Transport.start();
        this.isPlaying = true;
        this.isPaused = false;
        this.startTimeUpdateLoop();

        if (this.onPlayStateChange) {
            this.onPlayStateChange('playing');
        }
    }

    /**
     * Stop playback
     */
    stop() {
        console.log('Stopping playback');
        
        // Cancel update loop
        if (this.updateLoopId) {
            cancelAnimationFrame(this.updateLoopId);
            this.updateLoopId = null;
        }
        
        Tone.Transport.stop();
        Tone.Transport.cancel();
        
        // Reset Transport position
        Tone.Transport.seconds = 0;
        Tone.Transport.position = 0;
        
        // Clear all scheduled events
        this.scheduledEvents.forEach(id => {
            Tone.Transport.clear(id);
        });
        this.scheduledEvents = [];

        // Release all synth notes
        Object.values(this.synths).forEach(synth => {
            if (synth && synth.releaseAll) {
                synth.releaseAll();
            }
        });

        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;

        if (this.onPlayStateChange) {
            this.onPlayStateChange('stopped');
        }

        if (this.onTimeUpdate) {
            this.onTimeUpdate(0, this.totalDuration);
        }
    }

    /**
     * Seek to a specific time
     */
    seek(timeMs) {
        this.currentTime = Math.max(0, Math.min(timeMs, this.totalDuration));
        
        if (this.isPlaying) {
            this.stop();
            // Reschedule from new position
            this.notes = this.notes.map(note => ({
                ...note,
                time: note.time - this.currentTime
            })).filter(note => note.time >= 0);
            
            this.play();
        }

        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.currentTime, this.totalDuration);
        }
    }

    /**
     * Rewind to beginning
     */
    rewind() {
        const wasPlaying = this.isPlaying;
        this.stop();
        this.currentTime = 0;
        this.loadFromScore();
        
        if (wasPlaying) {
            this.play();
        }
    }

    /**
     * Skip forward
     */
    forward(amountMs = 5000) {
        const newTime = Math.min(this.currentTime + amountMs, this.totalDuration);
        this.seek(newTime);
    }

    /**
     * Skip backward
     */
    backward(amountMs = 5000) {
        const newTime = Math.max(this.currentTime - amountMs, 0);
        this.seek(newTime);
    }

    /**
     * Toggle loop mode
     */
    toggleLoop() {
        this.isLooping = !this.isLooping;
        return this.isLooping;
    }

    /**
     * Start time update loop
     */
    startTimeUpdateLoop() {
        // Cancel any existing update loop
        if (this.updateLoopId) {
            cancelAnimationFrame(this.updateLoopId);
        }

        const startTransportTime = Tone.Transport.seconds;
        console.log('Starting time update loop, transport at:', startTransportTime);
        let updateCount = 0;

        const update = () => {
            if (!this.isPlaying) {
                console.log('Update loop stopped, not playing');
                return;
            }

            updateCount++;
            
            // Get current time from Transport (more accurate than Date.now())
            const transportTime = Tone.Transport.seconds;
            const elapsedSeconds = transportTime - startTransportTime;
            this.currentTime = elapsedSeconds * 1000; // Convert to ms

            if (updateCount <= 5 || updateCount % 30 === 0) {
                console.log(`Update #${updateCount}: Transport=${transportTime.toFixed(2)}s, Elapsed=${elapsedSeconds.toFixed(2)}s, CurrentTime=${(this.currentTime/1000).toFixed(2)}s, Duration=${(this.totalDuration/1000).toFixed(2)}s`);
            }

            if (this.currentTime >= this.totalDuration) {
                console.log('Playback complete');
                if (this.isLooping) {
                    this.rewind();
                    this.play();
                } else {
                    this.stop();
                }
                return;
            }

            if (this.onTimeUpdate) {
                this.onTimeUpdate(this.currentTime, this.totalDuration);
            }

            // Update cursor position in score
            this.updateCursor();

            this.updateLoopId = requestAnimationFrame(update);
        };

        this.updateLoopId = requestAnimationFrame(update);
    }

    /**
     * Update cursor position in score
     */
    updateCursor() {
        if (!this.scoreEditor) return;

        const cursor = this.scoreEditor.getCursor();
        if (cursor && this.isPlaying) {
            // Move cursor based on current time
            // This would need to be implemented based on OSMD cursor API
        }
    }

    /**
     * Get current playback state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            isLooping: this.isLooping,
            currentTime: this.currentTime,
            totalDuration: this.totalDuration,
            tempo: this.tempo,
            volume: this.volume
        };
    }

    /**
     * Format time in mm:ss
     */
    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Play a single note (for preview/testing)
     */
    async playNote(pitch, duration = 500, velocity = 0.7) {
        if (!this.initialized) {
            await this.initialize();
        }

        const synth = this.synths.piano;
        synth.triggerAttackRelease(pitch, duration / 1000, Tone.now(), velocity);
    }

    /**
     * Play a chord (for preview/testing)
     */
    async playChord(pitches, duration = 500, velocity = 0.7) {
        if (!this.initialized) {
            await this.initialize();
        }

        const synth = this.synths.piano;
        synth.triggerAttackRelease(pitches, duration / 1000, Tone.now(), velocity);
    }

    /**
     * Cleanup
     */
    dispose() {
        this.stop();
        
        Object.values(this.synths).forEach(synth => {
            if (synth && synth.dispose) {
                synth.dispose();
            }
        });

        this.synths = {};
        this.initialized = false;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaybackEngine;
}
