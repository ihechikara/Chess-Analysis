// Chess analysis logic — ported from backend to browser
// Requires chess.js 0.10.3 loaded globally as `Chess`

// Lichess thresholds: inaccuracy ≥ 50 cp, mistake ≥ 100 cp, blunder ≥ 300 cp
const THRESHOLDS = {
  EXCELLENT:   10,   // < 10 cp loss
  GOOD:        50,   // < 50 cp loss (below inaccuracy)
  INACCURACY: 100,   // 50–99 cp loss
  MISTAKE:    300,   // 100–299 cp loss
  // ≥ 300 cp loss → blunder
};

const CRITICAL_SWING = 150;

// isBestMove: true when the played UCI matches the engine's top recommendation
export function classifyMove(cpLoss, isBestMove = false) {
  if (isBestMove)                      return 'best';
  if (cpLoss < THRESHOLDS.EXCELLENT)   return 'excellent';
  if (cpLoss < THRESHOLDS.GOOD)        return 'good';
  if (cpLoss < THRESHOLDS.INACCURACY)  return 'inaccuracy';
  if (cpLoss < THRESHOLDS.MISTAKE)     return 'mistake';
  return 'blunder';
}

function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function moveAccuracy(evalBefore, evalAfter) {
  const winBefore = winPercent(evalBefore);
  const winAfter  = winPercent(evalAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

const MAT = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function detectPhase(fen, plyIndex) {
  if (plyIndex < 20) return 'opening';
  const chess = new Chess(fen);
  const board = chess.board();
  let total = 0, hasQueens = false;
  for (const row of board) {
    for (const sq of row) {
      if (!sq || sq.type === 'k') continue;
      total += MAT[sq.type] || 0;
      if (sq.type === 'q') hasQueens = true;
    }
  }
  if (!hasQueens || total <= 20) return 'endgame';
  return 'middlegame';
}

function isTacticalMove(fen, uciMove) {
  if (!uciMove || uciMove === '(none)') return false;
  try {
    const chess = new Chess(fen);
    const move  = chess.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] });
    if (!move) return false;
    return move.flags.includes('c') || move.flags.includes('e') || chess.in_check();
  } catch (_) { return false; }
}

function positionDifficulty(evalBeforeWhite, cpLoss) {
  if (cpLoss > 300) return 'critical';
  const abs = Math.abs(evalBeforeWhite);
  if (abs < 80)  return 'hard';
  if (abs < 350) return 'moderate';
  return 'easy';
}

function consistencyScore(accuracies) {
  if (accuracies.length === 0) return 100;
  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const variance = accuracies.reduce((s, a) => s + (a - mean) ** 2, 0) / accuracies.length;
  return Math.max(0, Math.min(100, Math.round(100 - Math.sqrt(variance) * 1.8)));
}

function colorStats(moves, color) {
  const cMoves    = moves.filter(m => m.color === color);
  const cpLosses  = cMoves.map(m => m.cpLoss);
  const accuracies = cMoves.map(m => m.accuracy);
  const avgCpl    = cpLosses.length  ? cpLosses.reduce((a,b)=>a+b,0)  / cpLosses.length  : 0;
  const avgAcc    = accuracies.length ? accuracies.reduce((a,b)=>a+b,0) / accuracies.length : 0;
  const counts    = { blunders:0, mistakes:0, inaccuracies:0, good:0, excellent:0, best:0 };
  for (const m of cMoves) {
    if      (m.classification === 'blunder')    counts.blunders++;
    else if (m.classification === 'mistake')    counts.mistakes++;
    else if (m.classification === 'inaccuracy') counts.inaccuracies++;
    else if (m.classification === 'good')       counts.good++;
    else if (m.classification === 'excellent')  counts.excellent++;
    else if (m.classification === 'best')       counts.best++;
  }
  return {
    acpl:             Math.round(avgCpl),
    accuracy:         Math.round(avgAcc),
    consistencyScore: consistencyScore(accuracies),
    ...counts,
  };
}

function computePhaseStats(moves) {
  const init = () => ({ accuracy: 0, acpl: 0, blunders: 0, mistakes: 0, inaccuracies: 0,
                         excellent: 0, good: 0, best: 0, moveCount: 0, _cpl: 0, _acc: 0 });
  const phases = { opening: init(), middlegame: init(), endgame: init() };

  for (const m of moves) {
    const p = phases[m.phase];
    if (!p) continue;
    p.moveCount++;
    p._cpl += m.cpLoss;
    p._acc += m.accuracy;
    if      (m.classification === 'blunder')    p.blunders++;
    else if (m.classification === 'mistake')    p.mistakes++;
    else if (m.classification === 'inaccuracy') p.inaccuracies++;
    else if (m.classification === 'good')       p.good++;
    else if (m.classification === 'excellent')  p.excellent++;
    else if (m.classification === 'best')       p.best++;
  }

  for (const key of ['opening', 'middlegame', 'endgame']) {
    const p = phases[key];
    p.acpl     = p.moveCount > 0 ? Math.round(p._cpl / p.moveCount) : 0;
    p.accuracy = p.moveCount > 0 ? Math.round(p._acc / p.moveCount) : 0;
    delete p._cpl; delete p._acc;
  }
  return phases;
}

function analyzeAdvantageConversion(moves, playerColor, result) {
  let maxAdv = 0;
  for (const m of moves) {
    if (m.color !== playerColor) continue;
    const adv = playerColor === 'w' ? m.evalAfterWhite : -m.evalAfterWhite;
    if (adv > maxAdv) maxAdv = adv;
  }
  if (maxAdv < 150) return null;
  const won = result === (playerColor === 'w' ? '1-0' : '0-1');
  return { maxAdvantage: maxAdv, hadWinning: maxAdv >= 300, converted: won };
}

function analyzeEvalTrend(playerMoves, playerColor) {
  if (playerMoves.length < 8) return { comeback: false, collapse: false };
  const evals = playerMoves.map(m => playerColor === 'w' ? m.evalAfterWhite : -m.evalAfterWhite);
  let comeback = false, collapse = false;
  for (let i = 0; i < evals.length - 5; i++) {
    const later = evals.slice(i + 3, i + 8);
    if (!comeback && evals[i] < -200 && later.some(e => e > 0)) comeback = true;
    if (!collapse && evals[i] >  200 && later.some(e => e < -100)) collapse = true;
  }
  return { comeback, collapse };
}

function generateInsights(game) {
  const { playerColor, moves, phases, tacticalMisses, advantageConversion } = game;
  const pStats = playerColor === 'w' ? game.whiteStats : game.blackStats;
  const { blunders, mistakes, consistencyScore: cons } = pStats;

  const insights = [];
  const pMoves   = moves.filter(m => m.color === playerColor);

  if (blunders === 0 && mistakes === 0)
    insights.push({ type: 'success', title: 'Clean Game', text: 'No blunders or mistakes — a technically clean performance.' });
  else if (blunders === 0 && mistakes === 1)
    insights.push({ type: 'success', title: 'Solid Play', text: 'Only one mistake and no blunders — a strong overall game.' });

  if (blunders > 0) {
    const worst = pMoves.filter(m => m.classification === 'blunder')
                        .reduce((a, b) => a.cpLoss > b.cpLoss ? a : b);
    insights.push({ type: 'warning', title: 'Critical Blunder',
      text: `${worst.notation} on move ${worst.moveNumber} was the biggest error, losing ${(worst.cpLoss / 100).toFixed(1)} pawns of advantage.`,
      moveRef: worst.plyIndex + 1 });
  }

  if (advantageConversion) {
    const adv = (advantageConversion.maxAdvantage / 100).toFixed(1);
    if (advantageConversion.hadWinning && !advantageConversion.converted)
      insights.push({ type: 'warning', title: 'Failed to Convert',
        text: `You built a +${adv} winning advantage but couldn't convert it to a win.` });
    else if (advantageConversion.hadWinning && advantageConversion.converted)
      insights.push({ type: 'success', title: 'Advantage Converted',
        text: `You had a +${adv} advantage and successfully converted it to a win.` });
  }

  const op = phases.opening;
  if (op && op.moveCount >= 4) {
    if (op.accuracy >= 92)
      insights.push({ type: 'success', title: 'Strong Opening', text: `Excellent opening play: ${op.accuracy}% accuracy, ${op.acpl} ACPL.` });
    else if (op.accuracy < 72)
      insights.push({ type: 'warning', title: 'Opening Struggles', text: `Your opening accuracy was only ${op.accuracy}% (${op.acpl} ACPL). Review your opening repertoire.` });
  }

  const mg = phases.middlegame;
  if (mg && mg.moveCount >= 4 && mg.blunders + mg.mistakes >= 2)
    insights.push({ type: 'warning', title: 'Middlegame Difficulties',
      text: `${mg.blunders} blunders and ${mg.mistakes} mistakes in the middlegame — the most critical phase here.` });

  const eg = phases.endgame;
  if (eg && eg.moveCount >= 5) {
    if (eg.blunders + eg.mistakes > 1)
      insights.push({ type: 'warning', title: 'Endgame Technique',
        text: `${eg.blunders + eg.mistakes} significant errors in the endgame. Precision is critical with limited material.` });
    else if (eg.accuracy >= 88)
      insights.push({ type: 'success', title: 'Strong Endgame', text: `Precise endgame play: ${eg.accuracy}% accuracy.` });
  }

  if (tacticalMisses >= 3)
    insights.push({ type: 'info', title: 'Missed Tactics',
      text: `You missed ${tacticalMisses} forcing moves (checks or captures) recommended by the engine. Tactics training could help.` });

  if (cons >= 85)
    insights.push({ type: 'success', title: 'Consistent Play', text: `Very consistent decision-making throughout (score: ${cons}/100).` });
  else if (cons < 55)
    insights.push({ type: 'info', title: 'Erratic Play', text: `Alternating excellent and poor moves — try to maintain steady focus (score: ${cons}/100).` });

  const trend = analyzeEvalTrend(pMoves, playerColor);
  if (trend.comeback)
    insights.push({ type: 'success', title: 'Great Recovery', text: 'You fought back from a losing position — a sign of resilience.' });
  if (trend.collapse)
    insights.push({ type: 'warning', title: 'Position Collapse', text: 'Your position deteriorated rapidly at some point. Study the turning point to avoid this pattern.' });

  return insights.slice(0, 8);
}

function extractFens(pgn) {
  const chess = new Chess();
  if (!chess.load_pgn(pgn, { sloppy: true })) throw new Error('PGN parse failed');

  const verboseMoves = chess.history({ verbose: true });
  const sanMoves     = chess.history();
  const headers      = chess.header();

  chess.reset();
  const fens = [chess.fen()];
  for (const san of sanMoves) { chess.move(san); fens.push(chess.fen()); }

  return { fens, sanMoves, verboseMoves, headers };
}

// onProgress(currentIndex, total) — called before each position evaluation
export async function analyzeGame(pgn, engine, username = '', platform = '', depth = 15, onProgress = null) {
  let parsed;
  try { parsed = extractFens(pgn); }
  catch (e) { throw new Error(`PGN error: ${e.message}`); }

  const { fens, sanMoves, verboseMoves, headers } = parsed;

  const whiteName   = (headers.White || '').toLowerCase();
  const blackName   = (headers.Black || '').toLowerCase();
  const uname       = (username || '').toLowerCase();
  const playerColor = whiteName === uname ? 'w' : blackName === uname ? 'b' : 'w';

  await engine.newGame();

  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    if (onProgress) onProgress(i, fens.length);
    const { score, bestMove } = await engine.evaluate(fens[i], depth);
    evals.push({ score, bestMove });
  }

  const capCp = v => Math.max(-1000, Math.min(1000, v));

  const moves = [];
  for (let i = 0; i < sanMoves.length; i++) {
    const color = verboseMoves[i].color;

    const cpLoss = Math.max(0, capCp(evals[i].score) + capCp(evals[i + 1].score));

    const evalBeforeWhite = i % 2 === 0 ?  evals[i].score : -evals[i].score;
    const evalAfterWhite  = (i + 1) % 2 === 0 ? evals[i + 1].score : -evals[i + 1].score;
    const evalAfterClamped = Math.max(-1200, Math.min(1200, evalAfterWhite));

    const playedUCI  = verboseMoves[i].from + verboseMoves[i].to + (verboseMoves[i].promotion || '');
    const isBestMove = evals[i].bestMove !== '(none)' && playedUCI === evals[i].bestMove;
    const classification  = classifyMove(cpLoss, isBestMove);
    const accuracy        = moveAccuracy(evals[i].score, -evals[i + 1].score);
    const phase           = detectPhase(fens[i], i);
    const difficulty      = positionDifficulty(evalBeforeWhite, cpLoss);
    const isCriticalMoment = Math.abs(evalAfterWhite - evalBeforeWhite) > CRITICAL_SWING;
    const tacticalMissed   = isTacticalMove(fens[i], evals[i].bestMove) && cpLoss > 50;

    moves.push({
      moveNumber: Math.floor(i / 2) + 1,
      plyIndex:   i,
      notation:   sanMoves[i],
      color,
      fen:        fens[i + 1],
      evalBefore:      evals[i].score,
      evalBeforeWhite,
      evalAfterWhite:  evalAfterClamped,
      cpLoss,
      classification,
      accuracy,
      bestMove: evals[i].bestMove,
      phase,
      difficulty,
      isCriticalMoment,
      tacticalMissed,
    });
  }

  const whiteStats = colorStats(moves, 'w');
  const blackStats = colorStats(moves, 'b');

  const pMoves         = moves.filter(m => m.color === playerColor);
  const tacticalMisses = pMoves.filter(m => m.tacticalMissed).length;
  const cons           = whiteStats.consistencyScore;
  const phases         = computePhaseStats(moves);
  const advantageConversion = analyzeAdvantageConversion(moves, playerColor, headers.Result || '*');

  const criticalMoments = moves
    .filter(m => m.isCriticalMoment)
    .map(m => ({
      moveNumber: m.moveNumber, notation: m.notation, color: m.color,
      plyIndex: m.plyIndex, cpLoss: m.cpLoss, classification: m.classification,
      evalBefore: m.evalBeforeWhite, evalAfter: m.evalAfterWhite,
    }))
    .sort((a, b) => b.cpLoss - a.cpLoss)
    .slice(0, 8);

  const result = headers.Result || '*';
  let playerResult;
  if (result === '1-0')      playerResult = playerColor === 'w' ? 'win' : 'loss';
  else if (result === '0-1') playerResult = playerColor === 'b' ? 'win' : 'loss';
  else                       playerResult = 'draw';

  const evalGraph = moves.map(m => ({
    ply:            m.plyIndex,
    eval:           m.evalAfterWhite,
    label:          `${m.color === 'w' ? '' : '...'}${m.moveNumber}. ${m.notation}`,
    cpLoss:         m.cpLoss,
    classification: m.classification,
    color:          m.color,
  }));

  const aggCounts = {
    blunders:     whiteStats.blunders    + blackStats.blunders,
    mistakes:     whiteStats.mistakes    + blackStats.mistakes,
    inaccuracies: whiteStats.inaccuracies + blackStats.inaccuracies,
    good:         whiteStats.good        + blackStats.good,
    excellent:    whiteStats.excellent   + blackStats.excellent,
    best:         whiteStats.best        + blackStats.best,
  };

  const gameData = {
    white:        headers.White || 'Unknown',
    black:        headers.Black || 'Unknown',
    whiteRating:  parseInt(headers.WhiteElo  || 0, 10) || null,
    blackRating:  parseInt(headers.BlackElo  || 0, 10) || null,
    result, playerResult,
    date:    headers.Date    || headers.UTCDate || 'Unknown',
    event:   headers.Event  || '',
    site:    headers.Site   || '',
    opening: headers.Opening || headers.ECO || '',
    playerColor, pgn, moves, evalGraph,
    whiteStats,
    blackStats,
    ...aggCounts,
    accuracy:         whiteStats.accuracy,
    acpl:             whiteStats.acpl,
    avgCpLoss:        whiteStats.acpl,
    consistencyScore: cons,
    phases,
    criticalMoments,
    advantageConversion,
    tacticalMisses,
    totalMoves: sanMoves.length,
    platform,
  };

  gameData.insights = generateInsights(gameData);
  return gameData;
}
