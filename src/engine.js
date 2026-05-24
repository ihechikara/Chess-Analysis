// Browser Stockfish engine via Web Worker (UCI protocol)

class StockfishEngine {
  constructor() {
    this.worker = null;
    this.pendingLines = [];
    this.currentResolve = null;
    this.currentWaitFor = null;
    this.ready = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        const workerUrl = new URL('./stockfish-18-lite-single.js', import.meta.url);
        this.worker = new Worker(workerUrl);
      } catch (e) {
        return reject(new Error(`Failed to create Stockfish worker: ${e.message}`));
      }

      this.worker.onerror = (e) => {
        reject(new Error(`Stockfish worker error: ${e.message}`));
      };

      this.worker.onmessage = (event) => {
        const line = typeof event.data === 'string' ? event.data.trim() : String(event.data).trim();
        if (!line) return;

        if (this.currentWaitFor && line.startsWith(this.currentWaitFor)) {
          this.pendingLines.push(line);
          const collected = [...this.pendingLines];
          this.pendingLines = [];
          const res = this.currentResolve;
          this.currentResolve = null;
          this.currentWaitFor = null;
          if (res) res(collected);
        } else {
          this.pendingLines.push(line);
        }
      };

      this._sendAndWait('uci', 'uciok', 20000)
        .then(() => { this._send('setoption name Threads value 1'); })
        .then(() => this._sendAndWait('isready', 'readyok', 20000))
        .then(() => { this.ready = true; resolve(); })
        .catch(reject);
    });
  }

  _send(cmd) {
    if (this.worker) this.worker.postMessage(cmd);
  }

  _sendAndWait(cmd, waitFor, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.currentResolve = null;
        this.currentWaitFor = null;
        reject(new Error(`Stockfish timeout waiting for "${waitFor}" (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingLines = [];
      this.currentResolve = (lines) => { clearTimeout(timer); resolve(lines); };
      this.currentWaitFor = waitFor;
      this._send(cmd);
    });
  }

  async evaluate(fen, depth = 12) {
    if (!this.ready) throw new Error('Engine not started');
    this._send(`position fen ${fen}`);
    const lines = await this._sendAndWait(`go depth ${depth}`, 'bestmove', 120000);

    let score = 0;
    let bestMove = '(none)';

    for (const line of lines) {
      if (line.startsWith('info') && line.includes('score')) {
        const cpMatch = line.match(/score cp (-?\d+)/);
        if (cpMatch) score = parseInt(cpMatch[1], 10);
        const mateMatch = line.match(/score mate (-?\d+)/);
        if (mateMatch) {
          const m = parseInt(mateMatch[1], 10);
          score = m > 0 ? 10000 : -10000;
        }
      }
      if (line.startsWith('bestmove')) {
        const m = line.match(/bestmove (\S+)/);
        if (m && m[1] !== '(none)') bestMove = m[1];
      }
    }

    return { score, bestMove };
  }

  async evaluateTop3(fen, depth = 15) {
    if (!this.ready) throw new Error('Engine not started');
    this._send('setoption name MultiPV value 3');
    this._send(`position fen ${fen}`);
    const lines = await this._sendAndWait(`go depth ${depth}`, 'bestmove', 120000);
    this._send('setoption name MultiPV value 1');

    const pvMap = new Map();
    for (const line of lines) {
      if (line.startsWith('info') && line.includes('multipv')) {
        const pvIdxMatch = line.match(/multipv (\d+)/);
        const cpMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        const pvMoveMatch = line.match(/ pv (\S+)/);
        if (!pvIdxMatch || !pvMoveMatch) continue;

        const idx = parseInt(pvIdxMatch[1], 10);
        let score = 0;
        if (cpMatch) score = parseInt(cpMatch[1], 10);
        if (mateMatch) {
          const m = parseInt(mateMatch[1], 10);
          score = m > 0 ? 10000 : -10000;
        }
        pvMap.set(idx, { score, move: pvMoveMatch[1] });
      }
    }

    const topMoves = [];
    for (let i = 1; i <= 3; i++) {
      if (pvMap.has(i)) topMoves.push(pvMap.get(i));
    }

    const score = pvMap.has(1) ? pvMap.get(1).score : 0;
    return { score, topMoves };
  }

  async newGame() {
    this._send('ucinewgame');
    await this._sendAndWait('isready', 'readyok', 15000);
  }

  isReady() { return this.ready; }

  terminate() {
    this.ready = false;
    if (this.worker) {
      try { this.worker.terminate(); } catch (_) {}
      this.worker = null;
    }
  }
}

let _engine = null;

export async function getEngine() {
  if (_engine && _engine.isReady()) return _engine;
  _engine = new StockfishEngine();
  await _engine.start();
  return _engine;
}
