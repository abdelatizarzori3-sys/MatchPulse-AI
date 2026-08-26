import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8787);
const token = process.env.FOOTBALL_DATA_TOKEN || '';
const apiBase = 'https://api.football-data.org/v4';
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function probability(match) {
  const home = match.homeTeam?.name || 'Home team';
  const away = match.awayTeam?.name || 'Away team';
  const seed = [...home + away].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const homeAdvantage = 0.08;
  const homeP = Math.min(0.72, Math.max(0.18, 0.42 + ((seed % 17) - 8) / 100 + homeAdvantage));
  const awayP = Math.min(0.58, Math.max(0.16, 0.32 - ((seed % 11) - 5) / 100));
  const drawP = Math.max(0.12, 1 - homeP - awayP);
  const total = homeP + drawP + awayP;
  const values = [homeP / total, drawP / total, awayP / total];
  const confidence = Math.round(Math.max(...values) * 100);
  return { home: Math.round(values[0] * 100), draw: Math.round(values[1] * 100), away: Math.round(values[2] * 100), confidence, method: 'baseline-v1', disclaimer: 'احتمالات إرشادية وليست ضمانًا للنتيجة' };
}

function normalizeMatch(match) {
  return { id: match.id, utcDate: match.utcDate, status: match.status, competition: match.competition?.name || 'Unknown competition', home: match.homeTeam?.name || 'Unknown home team', away: match.awayTeam?.name || 'Unknown away team', score: match.score?.fullTime || null, prediction: probability(match) };
}

async function getMatches(url) {
  if (!token) return { matches: [], source: 'football-data.org', configured: false, message: 'أضف FOOTBALL_DATA_TOKEN لجلب المباريات الحقيقية.' };
  const response = await fetch(`${apiBase}/matches${url}`, { headers: { 'X-Auth-Token': token } });
  if (!response.ok) throw new Error(`Football data provider returned ${response.status}`);
  const data = await response.json();
  return { matches: (data.matches || []).map(normalizeMatch), source: 'football-data.org', configured: true, fetchedAt: new Date().toISOString() };
}

async function handler(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/api/health') return json(res, 200, { ok: true, provider: 'football-data.org', configured: Boolean(token) });
  if (requestUrl.pathname === '/api/matches') {
    try { return json(res, 200, await getMatches(requestUrl.search || '?status=SCHEDULED')); }
    catch (error) { return json(res, 502, { matches: [], configured: Boolean(token), error: 'تعذر الوصول إلى مصدر المباريات حاليًا.', detail: error.message }); }
  }
  let path = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  path = normalize(path).replace(/^([.][.][/\\])+/, '');
  const file = join(root, 'public', path);
  if (!file.startsWith(join(root, 'public')) || !existsSync(file)) return json(res, 404, { error: 'Not found' });
  try { const data = await readFile(file); res.writeHead(200, { 'content-type': contentTypes[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(data); }
  catch { json(res, 500, { error: 'Unable to read resource' }); }
}

http.createServer(handler).listen(port, () => console.log(`MatchPulse-AI listening on ${port}`));
