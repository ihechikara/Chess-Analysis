// frontend/app.js — all analysis runs in-browser via Stockfish WASM

import {
  renderEvalChart, highlightEvalChart,
  renderMoveList, renderMiniBoard, highlightMoveCell,
  renderInsights, renderPhaseBreakdown, renderCriticalMoments, renderFenResults,
  renderQualityBreakdown,
} from './ui.js';

import { getEngine }      from './engine.js';
import { analyzeGame }    from './analysis.js';
import { fetchGameByUrl } from './lichess.js';

// ── State ─────────────────────────────────────────────────────────────────────
const state = { activeTab: 'url', game: null, plyIndex: 0 };
const $ = id => document.getElementById(id);

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    $(`panel-${state.activeTab}`).classList.remove('hidden');
  });
});

// ── Loading / Error ───────────────────────────────────────────────────────────
function setLoading(on, msg = 'Analyzing…') {
  $('loading-text').textContent = msg;
  $('loading-overlay').classList.toggle('hidden', !on);
  ['url-btn','pgn-btn','fen-btn'].forEach(id => { const el = $(id); if (el) el.disabled = on; });
}

function showError(msg) { $('error-text').textContent = msg; $('error-banner').classList.remove('hidden'); }
$('error-close').addEventListener('click', () => $('error-banner').classList.add('hidden'));

function hideResults() {
  $('game-results').classList.add('hidden');
  $('fen-results').classList.add('hidden');
}

// ── Per-color stats derived from moves (fallback) ─────────────────────────────
function statsFromMoves(moves, color) {
  if (!moves) return {};
  const cMoves = moves.filter(m => m.color === color);
  let blunders = 0, mistakes = 0, inaccuracies = 0, totalCpl = 0, totalAcc = 0;
  for (const m of cMoves) {
    const c = m.classification;
    if      (c === 'blunder')    blunders++;
    else if (c === 'mistake')    mistakes++;
    else if (c === 'inaccuracy') inaccuracies++;
    totalCpl += m.cpLoss  || 0;
    totalAcc += m.accuracy || 0;
  }
  const n = cMoves.length;
  return {
    blunders, mistakes, inaccuracies,
    acpl:     n ? Math.round(totalCpl / n) : 0,
    accuracy: n ? Math.round(totalAcc / n * 10) / 10 : 0,
  };
}

// ── Game rendering ────────────────────────────────────────────────────────────
function renderGame(game) {
  hideResults();
  state.game     = game;
  state.plyIndex = 0;

  $('res-white').textContent   = playerLabel(game.white, game.whiteRating);
  $('res-black').textContent   = playerLabel(game.black, game.blackRating);
  $('res-result').textContent  = game.result || '';
  $('res-date').textContent    = formatDate(game.date);
  $('res-opening').textContent = game.opening || '';

  const linkEl = $('res-link');
  if (game.url) { linkEl.href = game.url; linkEl.classList.remove('hidden'); }
  else            linkEl.classList.add('hidden');

  const ws = game.whiteStats || statsFromMoves(game.moves, 'w');
  const bs = game.blackStats || statsFromMoves(game.moves, 'b');

  $('psb-white-name').textContent = game.white || 'White';
  $('psb-black-name').textContent = game.black || 'Black';

  $('w-blunders').textContent     = ws.blunders     ?? '—';
  $('w-mistakes').textContent     = ws.mistakes     ?? '—';
  $('w-inaccuracies').textContent  = ws.inaccuracies  ?? '—';
  $('w-accuracy').textContent     = ws.accuracy != null ? ws.accuracy + '%' : '—';
  $('w-acpl').textContent         = ws.acpl         ?? '—';

  $('b-blunders').textContent     = bs.blunders     ?? '—';
  $('b-mistakes').textContent     = bs.mistakes     ?? '—';
  $('b-inaccuracies').textContent  = bs.inaccuracies  ?? '—';
  $('b-accuracy').textContent     = bs.accuracy != null ? bs.accuracy + '%' : '—';
  $('b-acpl').textContent         = bs.acpl         ?? '—';

  if (game.blunders == null) {
    const all  = statsFromMoves(game.moves, 'w');
    const allB = statsFromMoves(game.moves, 'b');
    game.blunders     = (all.blunders    || 0) + (allB.blunders    || 0);
    game.mistakes     = (all.mistakes    || 0) + (allB.mistakes    || 0);
    game.inaccuracies = (all.inaccuracies || 0) + (allB.inaccuracies || 0);
    game.best = game.excellent = game.good = 0;
  }

  renderQualityBreakdown(game);
  renderInsights(game.insights || []);
  renderPhaseBreakdown(game.phases || {});
  renderEvalChart(game.evalGraph, goToPly);
  renderCriticalMoments(game.criticalMoments || [], goToPly);

  renderMoveList(game.moves, goToPly);
  goToPly(0);

  $('game-results').classList.remove('hidden');
}

// ── Board navigation ──────────────────────────────────────────────────────────
function goToPly(ply) {
  if (!state.game) return;
  state.plyIndex = Math.max(0, Math.min(ply, state.game.moves.length));
  const fen = state.plyIndex === 0
    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    : state.game.moves[state.plyIndex - 1].fen;
  renderMiniBoard(fen);
  highlightMoveCell(state.plyIndex);
  highlightEvalChart(state.plyIndex);
}

$('btn-first').addEventListener('click', () => goToPly(0));
$('btn-prev').addEventListener('click',  () => goToPly(state.plyIndex - 1));
$('btn-next').addEventListener('click',  () => state.game && goToPly(state.plyIndex + 1));
$('btn-last').addEventListener('click',  () => state.game && goToPly(state.game.moves.length));

document.addEventListener('keydown', e => {
  if (!state.game) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft')  { e.preventDefault(); goToPly(state.plyIndex - 1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); goToPly(state.plyIndex + 1); }
  if (e.key === 'Home')       { e.preventDefault(); goToPly(0); }
  if (e.key === 'End')        { e.preventDefault(); state.game && goToPly(state.game.moves.length); }
});

document.addEventListener('goToPly', e => goToPly(e.detail));

// ── Engine singleton ──────────────────────────────────────────────────────────
let enginePromise = null;

function ensureEngine() {
  if (!enginePromise) {
    enginePromise = getEngine().catch(err => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

// ── Form handlers ─────────────────────────────────────────────────────────────
$('url-btn').addEventListener('click', async () => {
  const url = $('url-input').value.trim();
  if (!url) return showError('Please enter a Lichess URL.');
  $('error-banner').classList.add('hidden');

  setLoading(true, 'Fetching game from Lichess…');
  let pgn, gameUrl;
  try {
    const fetched = await fetchGameByUrl(url);
    pgn     = fetched.pgn;
    gameUrl = fetched.url;
  } catch (err) {
    showError(err.message);
    setLoading(false);
    return;
  }

  try {
    setLoading(true, 'Loading engine…');
    const engine = await ensureEngine();
    const onProgress = (i, n) => setLoading(true, `Analyzing position ${i + 1} of ${n}…`);
    const game = await analyzeGame(pgn, engine, '', 'lichess', 15, onProgress);
    game.url = gameUrl;
    renderGame(game);
  } catch (err) { showError(err.message); }
  finally { setLoading(false); }
});

$('pgn-btn').addEventListener('click', async () => {
  const pgn = $('pgn-input').value.trim();
  if (!pgn) return showError('Please paste a PGN.');
  $('error-banner').classList.add('hidden');

  try {
    setLoading(true, 'Loading engine…');
    const engine = await ensureEngine();
    const onProgress = (i, n) => setLoading(true, `Analyzing position ${i + 1} of ${n}…`);
    const game = await analyzeGame(pgn, engine, '', '', 15, onProgress);
    renderGame(game);
  } catch (err) { showError(err.message); }
  finally { setLoading(false); }
});

$('fen-btn').addEventListener('click', async () => {
  const fen = $('fen-input').value.trim();
  if (!fen) return showError('Please enter a FEN string.');
  $('error-banner').classList.add('hidden');

  try {
    setLoading(true, 'Loading engine…');
    const engine = await ensureEngine();
    setLoading(true, 'Evaluating position…');
    const result = await engine.evaluateTop3(fen, 15);

    const sideToMove    = fen.split(' ')[1] || 'w';
    const signFactor    = sideToMove === 'b' ? -1 : 1;
    result.evalWhitePov = result.score * signFactor;
    result.sideToMove   = sideToMove;

    result.topMoves = result.topMoves.map(m => {
      try {
        const chess   = new Chess(fen);
        const from    = m.move.slice(0, 2);
        const to      = m.move.slice(2, 4);
        const prom    = m.move[4] || undefined;
        const moveObj = chess.move({ from, to, promotion: prom });
        return { ...m, san: moveObj ? moveObj.san : m.move, uci: m.move };
      } catch (_) {
        return { ...m, san: m.move, uci: m.move };
      }
    });

    hideResults();
    renderFenResults(result.evalWhitePov, result.topMoves);
    $('fen-results').classList.remove('hidden');
  } catch (err) { showError(err.message); }
  finally { setLoading(false); }
});

$('url-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('url-btn').click(); });
$('fen-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('fen-btn').click(); });

// ── Helpers ───────────────────────────────────────────────────────────────────
function playerLabel(name, rating) { return rating ? `${name} (${rating})` : name; }

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'Unknown') return '';
  const d = new Date(dateStr.replace(/\./g, '-'));
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
