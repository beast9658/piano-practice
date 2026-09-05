<p align="center">
  <img src="frontend/public/favicon.svg" width="96" height="96" alt="钢琴 logo" />
</p>

<h1 align="center">Piano Practice</h1>

<p align="center">
  A web-based piano practice companion — load a MIDI file and turn it into a guided practice session with tempo control, hand isolation, looping, and AI-powered fingering suggestions.
</p>

<p align="center">
  <a href="#preview">Preview</a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="#tech-stack">Tech Stack</a>
  ·
  <a href="#roadmap">Roadmap</a>
</p>

## Preview

| Piano Keyboard | MIDI Practice |
|---|---|
| Play directly with your computer keyboard or a Web MIDI keyboard | Load a `.mid` / `.midi` file and start sight-reading, looping tricky bars, or focusing on one hand at a time |
| Listen mode highlights the note you should press next | AI suggestions help with fingering via the Python + LLM backend |

## Features

- **Built-in piano keyboard** — Play with your computer keyboard (no external hardware needed) or connect a Web MIDI device
- **MIDI file practice** — Load any `.mid` / `.midi` file, see the score, adjust tempo, loop sections, and practice left-hand / right-hand parts separately
- **Listen mode** — The app waits for you to press the correct next note before advancing; great for building muscle memory
- **LLM-powered fingering** — Python backend talks to an LLM to suggest optimal fingerings for tricky passages
- **Literary, minimal UI** — Warm, paper-and-ink aesthetic that stays out of your way while you practice

## Quick Start

### Prerequisites

- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Node.js 18+ with [pnpm](https://pnpm.io/)

### Terminal 1 — Python backend

```bash
cd backend
uv sync
PIANO_WEB_PORT=8001 .venv/bin/python -m core.web_server
```

### Terminal 2 — Frontend dev server

```bash
cd frontend
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173 in your browser and import a `.mid` / `.midi` file to start practicing.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Python (FastAPI-style HTTP server) |
| MIDI Parsing | Python (backend), Web MIDI API (browser) |
| LLM Integration | Python → LLM API for fingering suggestions |
| No desktop shell | Pure web app — no Rust, no Tauri |

## Background

This project started as a desktop app with Rust + Tauri, but was later converted to a pure web application. The Python backend handles MIDI parsing, practice session records, and LLM-backed structure analysis / fingering recommendations. The frontend is a self-contained React app that can run independently for basic piano keyboard play.

## Roadmap

- [ ] Creation mode — compose and edit on the built-in piano
- [ ] Intelligent analysis for personal practice patterns
- [ ] More professional intelligent practice recommendations

## License

This project is available for personal, research, educational, and other noncommercial use.

**License:** [PolyForm Noncommercial License 1.0.0](LICENSE)
