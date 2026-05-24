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

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

The Stockfish 18 Lite WASM engine runs in a Web Worker inside the browser. The engine files are included in the repository:

- `src/stockfish-18-lite-single.js`
- `src/stockfish-18-lite-single.wasm`

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
