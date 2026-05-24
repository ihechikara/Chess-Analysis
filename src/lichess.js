// Browser-compatible Lichess API client

const BASE = 'https://lichess.org';

export async function fetchGameByUrl(url) {
  const match = url.match(/lichess\.org\/([A-Za-z0-9]{8})/);
  if (!match) throw new Error('Invalid Lichess URL. Expected: https://lichess.org/GAMEID');

  const id        = match[1];
  const exportUrl = `${BASE}/game/export/${id}?moves=true&tags=true&clocks=false&evals=false`;

  const res = await fetch(exportUrl, {
    headers: { 'Accept': 'application/x-chess-pgn' },
  });

  if (res.status === 404) throw new Error(`Game "${id}" not found on Lichess`);
  if (!res.ok) throw new Error(`Lichess API error: ${res.status} ${res.statusText}`);

  const pgn = await res.text();
  if (!pgn.trim()) throw new Error('Empty PGN received from Lichess');

  return { id, pgn, url: `${BASE}/${id}` };
}
