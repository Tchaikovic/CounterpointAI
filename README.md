# CounterpointAI

A MuseScore-like web-based music notation editor with AI-powered composition assistance.

## Features

- **Music Notation Display**: View and edit music scores using OpenSheetMusicDisplay
- **File Support**: Open MuseScore (.mscz), MusicXML (.musicxml, .mxl, .xml) files
- **MIDI-like Playback**: Listen to your compositions with Tone.js synthesis
- **AI Assistant**: Chat with an LLM (via OpenRouter) to modify and create music using natural language
- **Score Creation**: Create new scores with custom instruments, key signatures, and time signatures
- **Export**: Save your work as MusicXML files

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/CounterpointAI.git
cd CounterpointAI
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

### Configuration

#### OpenRouter API Key

To use the AI assistant features, you'll need an OpenRouter API key:

1. Sign up at [OpenRouter](https://openrouter.ai/)
2. Create an API key
3. Enter your API key in the chat panel of the application

Supported models:
- Claude 3.5 Sonnet (default)
- Claude 3 Haiku
- GPT-4o
- GPT-4o Mini
- Gemini Pro 1.5

## Usage

### Opening Files

- Click the folder icon or press `Ctrl+O` to open a file
- Supported formats: .mscz, .musicxml, .mxl, .xml

### Creating a New Score

- Click the new file icon or press `Ctrl+N`
- Configure title, composer, key signature, time signature, and instruments
- Click "Create Score"

### Editing

- Use the note palette on the left to select note durations
- Click on the score to add notes (basic editing)
- Use keyboard shortcuts:
  - `1-5`: Select note duration (whole to sixteenth)
  - `Arrow Up/Down`: Transpose selected note
  - `Delete/Backspace`: Delete selected note
  - `Ctrl+Z`: Undo
  - `Ctrl+Y` or `Ctrl+Shift+Z`: Redo

### Playback

- Click the play button or press `Space` to play/pause
- Adjust tempo with the BPM input
- Control volume with the slider
- Use the timeline to seek through the score
- Enable loop mode for continuous playback

### AI Assistant

Chat with the AI to modify your music:

**Example prompts:**
- "Add a bass line to accompany the melody"
- "Transpose the score up a major third"
- "Add a countermelody in the style of Bach"
- "Fill measures 5-8 with a rhythmic variation"
- "Harmonize this melody in a classical style"

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Music Rendering**: OpenSheetMusicDisplay (OSMD)
- **Audio Synthesis**: Tone.js
- **File Handling**: JSZip (for compressed formats)
- **Backend**: Express.js
- **AI Integration**: OpenRouter API

## Project Structure

```
CounterpointAI/
├── public/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── app.js
│   │   ├── score-editor.js
│   │   ├── playback-engine.js
│   │   ├── ai-assistant.js
│   │   └── musicxml-generator.js
│   └── index.html
├── uploads/
├── server.js
├── package.json
└── README.md
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/) for music notation rendering
- [Tone.js](https://tonejs.github.io/) for audio synthesis
- [OpenRouter](https://openrouter.ai/) for LLM API access
