// frontend/ui.js
// DOM rendering helpers

const PIECE_SYMBOLS = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};
const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = [8,7,6,5,4,3,2,1];

let _evalChart    = null;
let _evalGraph    = [];
let _evalCurrentPly = -1;  // 0-based index into _evalGraph

// ── Plugin: current-ply vertical marker ──────────────────────────────────────
const currentPlyPlugin = {
  id: 'currentPly',
  afterDraw(chart) {
    if (_evalCurrentPly < 0 || _evalCurrentPly >= _evalGraph.length) return;
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    const xPos = x.getPixelForValue(_evalCurrentPly);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xPos, top);
    ctx.lineTo(xPos, bottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Small circle at the data point
    const yPos = chart.scales.y.getPixelForValue(
      Math.max(-1200, Math.min(1200, _evalGraph[_evalCurrentPly].eval))
    );
    ctx.beginPath();
    ctx.arc(xPos, yPos, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#5c7cfa';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  },
};

// ── Eval graph ────────────────────────────────────────────────────────────────
const BADGE_COLORS = {
  blunder:    '#fa5252',
  mistake:    '#fd7e14',
  inaccuracy: '#fab005',
  good:       '#20c997',
  excellent:  '#15aabf',
  best:       '#40c057',
};

export function renderEvalChart(evalGraph, onClickPly) {
  const canvas = document.getElementById('eval-chart');
  const ctx    = canvas.getContext('2d');
  if (_evalChart) { _evalChart.destroy(); _evalChart = null; }

  _evalGraph      = evalGraph;
  _evalCurrentPly = -1;

  const labels = evalGraph.map(p => p.label);
  const data   = evalGraph.map(p => Math.max(-1200, Math.min(1200, p.eval)));

  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0,   'rgba(64,192,87,0.35)');
  grad.addColorStop(0.5, 'rgba(64,192,87,0.04)');
  grad.addColorStop(0.5, 'rgba(250,82,82,0.04)');
  grad.addColorStop(1,   'rgba(250,82,82,0.35)');

  _evalChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      data,
      borderColor: '#5c7cfa',
      borderWidth: 1.5,
      pointRadius:            0,
      pointHoverRadius:       5,
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor:  '#5c7cfa',
      pointHoverBorderWidth:  2,
      fill: true,
      backgroundColor: grad,
      tension: 0.3,
    }]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(evt, _elements, chart) {
        if (!onClickPly) return;
        const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
        if (pts.length) onClickPly(pts[0].index + 1); // +1: ply is 1-based
      },
      onHover(evt) {
        if (evt.native) evt.native.target.style.cursor = 'pointer';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(22,25,37,0.95)',
          borderColor: '#2e3350',
          borderWidth: 1,
          titleColor: '#e0e4f0',
          bodyColor: '#7a82a8',
          padding: 10,
          callbacks: {
            title: items => items[0]?.label || '',
            label: c => {
              const v = c.raw;
              if (v >= 1000)  return '  Eval: Mate for White';
              if (v <= -1000) return '  Eval: Mate for Black';
              return '  Eval: ' + (v >= 0 ? '+' : '') + (v / 100).toFixed(2);
            },
            afterLabel: c => {
              const g = _evalGraph[c.dataIndex];
              if (!g) return '';
              const lines = [];
              if (g.cpLoss > 0) lines.push(`  Loss: −${g.cpLoss} cp`);
              if (g.classification) lines.push(`  ${g.classification.charAt(0).toUpperCase() + g.classification.slice(1)}`);
              return lines;
            },
            labelColor: c => {
              const g  = _evalGraph[c.dataIndex];
              const bg = g?.classification ? (BADGE_COLORS[g.classification] || '#5c7cfa') : '#5c7cfa';
              return { borderColor: bg, backgroundColor: bg, borderRadius: 3 };
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#7a82a8', maxRotation: 0, autoSkip: true, maxTicksLimit: 20, font: { size: 10 } },
          grid:  { color: '#2e3350' },
        },
        y: {
          min: -1200, max: 1200,
          ticks: { color: '#7a82a8', font: { size: 10 }, callback: v => {
            if (v >= 1000)  return '+M';
            if (v <= -1000) return '-M';
            return (v >= 0 ? '+' : '') + (v / 100).toFixed(1);
          }},
          grid: { color: '#2e3350' },
        },
      },
    },
    plugins: [currentPlyPlugin],
  });
}

// Called by app.js whenever the board navigates to a new ply
export function highlightEvalChart(ply) {
  _evalCurrentPly = ply - 1; // convert 1-based ply to 0-based chart index
  if (_evalChart) _evalChart.update('none'); // redraw without animation
}

// ── Move list ─────────────────────────────────────────────────────────────────
export function renderMoveList(moves, onClickPly) {
  const container = document.getElementById('move-list');
  container.innerHTML = '';
  let i = 0;
  while (i < moves.length) {
    const wMove = moves[i], bMove = moves[i + 1];
    const row = document.createElement('div');
    row.className = 'move-row';
    const numCell = document.createElement('div');
    numCell.className = 'move-num';
    numCell.textContent = `${wMove.moveNumber}.`;
    row.appendChild(numCell);
    row.appendChild(makeMoveCell(wMove, i, onClickPly));
    if (bMove) {
      row.appendChild(makeMoveCell(bMove, i + 1, onClickPly));
    } else {
      const empty = document.createElement('div'); empty.className = 'move-cell'; row.appendChild(empty);
    }
    container.appendChild(row);
    i += bMove ? 2 : 1;
  }
}

function makeMoveCell(move, plyIdx, onClickPly) {
  const cell = document.createElement('div');
  cell.className = 'move-cell';
  cell.dataset.ply = plyIdx + 1;
  if (move.isCriticalMoment) cell.classList.add('critical-move');

  const badge = document.createElement('span');
  badge.className = `move-badge badge-${move.classification}`;
  badge.title = `${move.classification} (−${move.cpLoss} cp)`;

  const notation = document.createElement('span');
  notation.className = 'move-notation';
  notation.textContent = move.notation;

  const cpLoss = document.createElement('span');
  cpLoss.className = 'move-cploss';
  cpLoss.textContent = move.cpLoss > 0 ? `−${move.cpLoss}` : '';

  cell.appendChild(badge);
  cell.appendChild(notation);
  cell.appendChild(cpLoss);
  cell.addEventListener('click', () => onClickPly(parseInt(cell.dataset.ply, 10)));
  return cell;
}

export function highlightMoveCell(ply) {
  document.querySelectorAll('.move-cell').forEach(el =>
    el.classList.toggle('selected', parseInt(el.dataset.ply, 10) === ply)
  );
  const el = document.querySelector(`.move-cell[data-ply="${ply}"]`);
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── Mini chess board ──────────────────────────────────────────────────────────
export function renderMiniBoard(fen) {
  const board = document.getElementById('mini-board');
  if (typeof Chess === 'undefined') { board.textContent = 'chess.js not loaded'; return; }
  const chess  = new Chess(fen);
  const pieces = chess.board();
  board.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = document.createElement('div');
      sq.className = `mini-sq ${(r + f) % 2 === 0 ? 'light' : 'dark'}`;
      const piece = pieces[r][f];
      if (piece) {
        const span = document.createElement('span');
        span.className   = `mini-piece ${piece.color === 'w' ? 'white' : 'black'}`;
        span.textContent = PIECE_SYMBOLS[piece.color + piece.type] || '';
        sq.appendChild(span);
      }
      board.appendChild(sq);
    }
  }
  document.getElementById('board-fen').textContent = fen;
}

// ── Insights ──────────────────────────────────────────────────────────────────
const INSIGHT_ICONS = { success: '✓', warning: '!', info: 'i' };

export function renderInsights(insights) {
  const container = document.getElementById('insights-list');
  container.innerHTML = '';
  if (!insights || insights.length === 0) {
    container.innerHTML = '<p class="empty-note">No insights generated.</p>';
    return;
  }
  insights.forEach(ins => {
    const card = document.createElement('div');
    card.className = `insight-card insight-${ins.type}`;

    const icon = document.createElement('div');
    icon.className = 'insight-icon';
    icon.textContent = INSIGHT_ICONS[ins.type] || 'i';

    const body = document.createElement('div');
    body.className = 'insight-body';

    const title = document.createElement('div');
    title.className = 'insight-title';
    title.textContent = ins.title;

    const text = document.createElement('div');
    text.className = 'insight-text';
    text.textContent = ins.text;

    body.appendChild(title);
    body.appendChild(text);

    if (ins.moveRef != null) {
      const btn = document.createElement('button');
      btn.className = 'insight-move-btn';
      btn.textContent = 'Go to move →';
      btn.addEventListener('click', () =>
        document.dispatchEvent(new CustomEvent('goToPly', { detail: ins.moveRef }))
      );
      body.appendChild(btn);
    }

    card.appendChild(icon);
    card.appendChild(body);
    container.appendChild(card);
  });
}

// ── Phase breakdown ───────────────────────────────────────────────────────────
export function renderPhaseBreakdown(phases) {
  for (const [name, data] of Object.entries(phases)) {
    const card = document.getElementById(`phase-${name}`);
    if (!card) continue;
    const accEl    = card.querySelector('.phase-accuracy');
    const acplEl   = card.querySelector('.phase-acpl');
    const countsEl = card.querySelector('.phase-counts');

    if (!data || data.moveCount === 0) {
      accEl.textContent = '—'; acplEl.textContent = '';
      countsEl.innerHTML = '<span class="pc-badge pc-none">No moves</span>';
      continue;
    }

    accEl.textContent = data.accuracy.toFixed(1) + '%';
    acplEl.textContent = `${data.acpl} ACPL · ${data.moveCount} moves`;

    const badges = [];
    if (data.blunders > 0)    badges.push(`<span class="pc-badge pc-blunder">${data.blunders} blunder${data.blunders > 1 ? 's':''}</span>`);
    if (data.mistakes > 0)    badges.push(`<span class="pc-badge pc-mistake">${data.mistakes} mistake${data.mistakes > 1 ? 's':''}</span>`);
    if (data.inaccuracies > 0) badges.push(`<span class="pc-badge pc-inaccuracy">${data.inaccuracies} inaccuracy</span>`);
    if (badges.length === 0)  badges.push('<span class="pc-badge pc-clean">Clean</span>');
    countsEl.innerHTML = badges.join('');
  }
}

// ── Critical moments ──────────────────────────────────────────────────────────
export function renderCriticalMoments(moments, onClickPly) {
  const container = document.getElementById('critical-moments-list');
  container.innerHTML = '';
  if (!moments || moments.length === 0) {
    container.innerHTML = '<p class="empty-note">No critical moments — you played consistently throughout.</p>';
    return;
  }
  moments.forEach(cm => {
    const item = document.createElement('div');
    item.className = 'cm-item';
    item.addEventListener('click', () => onClickPly(cm.plyIndex + 1));

    const b  = (cm.evalBefore / 100).toFixed(1), a = (cm.evalAfter / 100).toFixed(1);
    const sb = cm.evalBefore >= 0 ? '+' : '', sa = cm.evalAfter >= 0 ? '+' : '';

    item.innerHTML = `
      <span class="cm-move">Move ${cm.moveNumber} <span class="cm-side">(${cm.color === 'w' ? 'White' : 'Black'})</span></span>
      <span class="cm-notation">${esc(cm.notation)}</span>
      <span class="cm-badge cm-${cm.classification}">${cm.classification}</span>
      <span class="cm-eval">${sb}${b} → ${sa}${a}</span>
    `;
    container.appendChild(item);
  });
}

// ── FEN results ───────────────────────────────────────────────────────────────
export function renderFenResults(evalWhitePov, topMoves) {
  const scoreEl = document.getElementById('fen-eval-score');
  const descEl  = document.getElementById('fen-eval-desc');

  if (evalWhitePov >= 10000) {
    scoreEl.textContent = 'M+'; scoreEl.className = 'fen-eval-score eval-white';
    descEl.textContent  = 'Checkmate for White';
  } else if (evalWhitePov <= -10000) {
    scoreEl.textContent = 'M-'; scoreEl.className = 'fen-eval-score eval-black';
    descEl.textContent  = 'Checkmate for Black';
  } else {
    const pawns = (evalWhitePov / 100).toFixed(2);
    scoreEl.textContent = (evalWhitePov >= 0 ? '+' : '') + pawns;
    scoreEl.className   = `fen-eval-score ${evalWhitePov > 30 ? 'eval-white' : evalWhitePov < -30 ? 'eval-black' : 'eval-equal'}`;
    descEl.textContent  = evalWhitePov > 30 ? 'White is better' : evalWhitePov < -30 ? 'Black is better' : 'Equal position';
  }

  const listEl = document.getElementById('top-moves-list');
  listEl.innerHTML = '';
  topMoves.forEach((m, i) => {
    const pawn = (m.score / 100).toFixed(2);
    const div = document.createElement('div');
    div.className = 'top-move-item';
    div.innerHTML = `
      <span class="top-move-rank">${i + 1}.</span>
      <span class="top-move-san">${esc(m.san || m.uci || m.move)}</span>
      <span class="top-move-score">${m.score >= 0 ? '+' : ''}${pawn}</span>
    `;
    listEl.appendChild(div);
  });
}

// ── Move quality breakdown (PRD: consistency %) ───────────────────────────────
export function renderQualityBreakdown(game) {
  const container = document.getElementById('quality-breakdown');
  if (!container) return;

  const bestMoves = (game.best || 0) + (game.excellent || 0) + (game.good || 0);
  const inaccuracies = game.inaccuracies || 0;
  const mistakes     = game.mistakes     || 0;
  const blunders     = game.blunders     || 0;
  const total = bestMoves + inaccuracies + mistakes + blunders;

  if (total === 0) {
    container.innerHTML = '<p class="empty-note">No moves to analyze.</p>';
    return;
  }

  const pct = n => Math.round(n / total * 100);
  const bestPct    = pct(bestMoves);
  const inaccPct   = pct(inaccuracies);
  const mistakePct = pct(mistakes);
  const blunderPct = pct(blunders);

  container.innerHTML = `
    <div class="quality-bar">
      <div class="qb-seg qb-best"    style="width:${bestPct}%"    title="Best Moves ${bestPct}%"></div>
      <div class="qb-seg qb-inacc"   style="width:${inaccPct}%"   title="Inaccuracies ${inaccPct}%"></div>
      <div class="qb-seg qb-mistake" style="width:${mistakePct}%" title="Mistakes ${mistakePct}%"></div>
      <div class="qb-seg qb-blunder" style="width:${blunderPct}%" title="Blunders ${blunderPct}%"></div>
    </div>
    <div class="quality-legend">
      <div class="ql-item">
        <span class="ql-dot ql-best"></span>
        <span class="ql-label">Best Moves</span>
        <span class="ql-count">${bestMoves}</span>
        <span class="ql-pct">${bestPct}%</span>
      </div>
      <div class="ql-item">
        <span class="ql-dot ql-inacc"></span>
        <span class="ql-label">Inaccuracies</span>
        <span class="ql-count">${inaccuracies}</span>
        <span class="ql-pct">${inaccPct}%</span>
      </div>
      <div class="ql-item">
        <span class="ql-dot ql-mistake"></span>
        <span class="ql-label">Mistakes</span>
        <span class="ql-count">${mistakes}</span>
        <span class="ql-pct">${mistakePct}%</span>
      </div>
      <div class="ql-item">
        <span class="ql-dot ql-blunder"></span>
        <span class="ql-label">Blunders</span>
        <span class="ql-count">${blunders}</span>
        <span class="ql-pct">${blunderPct}%</span>
      </div>
    </div>
  `;
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
