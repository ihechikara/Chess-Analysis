# Chess Analysis App

A browser-based chess game analysis tool powered by Stockfish 18 WASM. Runs entirely in the browser — no server-side processing.

## Features

- Analyze games by Lichess URL, PGN, or FEN string
- Move-by-move evaluation with blunder/mistake/inaccuracy classification
- Accuracy and ACPL (Average Centipawn Loss) per player
- Game quality breakdown by phase (opening, middlegame, endgame)
- Interactive evaluation graph and critical moments
- Top 3 move suggestions for FEN positions
- Interactive board with move navigation

## Getting Started

> **Important:** The Stockfish engine files are not included in the repository due to their size (~108 MB). They are downloaded automatically during `npm install` via the `postinstall` script.

### 1. Install dependencies (this also copies the Stockfish engine files into `src/`)

```bash
npm install
```

### 2. Start the dev server

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

The Stockfish WASM engine runs in a Web Worker inside the browser. After `npm install`, the engine files are copied from the `stockfish` npm package into `src/`:

- `src/stockfish-18-single.js`
- `src/stockfish-18-single.wasm`

These files are listed in `.gitignore` and will not be committed to the repository. If they are missing, re-run `npm install`.

## Usage

| Input | Description |
|-------|-------------|
| **Game URL** | Paste a Lichess game URL (e.g. `https://lichess.org/GAMEID`) |
| **PGN** | Paste a PGN string directly |
| **FEN** | Paste a FEN string to evaluate a single position |

## Tech Stack

- Stockfish 18 (WASM, single-threaded)
- chess.js — move parsing and validation
- Chart.js — evaluation graph
- Vanilla JS (ES modules), no build step required
