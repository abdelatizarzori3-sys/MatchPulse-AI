import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CalendarInputError, createCalendarIcs, selectCalendarMatches, validateCalendarSelection } from './lib/calendar.mjs';
import { createEntitlementVerifier, EntitlementError } from './lib/entitlements.mjs';

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

export async function getMatches(url) {
  if (!token) return { matches: [], source: 'football-data.org', configured: false, message: 'أضف FOOTBALL_DATA_TOKEN لجلب المباريات الحقيقية.' };
  const response = await fetch(`${apiBase}/matches${url}`, { headers: { 'X-Auth-Token': token } });
  if (!response.ok) throw new Error(`Football data provider returned ${response.status}`);
  const data = await response.json();
  return { matches: (data.matches || []).map(normalizeMatch), source: 'football-data.org', configured: true, fetchedAt: new Date().toISOString() };
}

function readJsonBody(req, limit = 24 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new CalendarInputError('INVALID_REQUEST', 'The export request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(text));
      } catch {
        reject(new CalendarInputError('INVALID_REQUEST', 'The export request must contain valid JSON.'));
      }
    });
  });
}

function calendarError(res, error) {
  if (error instanceof EntitlementError) {
    return json(res, error.status, { error: error.code, message: error.message });
  }
  if (error instanceof CalendarInputError) {
    return json(res, 422, { error: error.code, message: 'تحقق من المباريات المحددة والفرق المفضلة ثم حاول مجددًا.' });
  }
  return json(res, 503, { error: 'CALENDAR_EXPORT_UNAVAILABLE', message: 'تعذر إنشاء ملف التقويم حاليًا. حاول لاحقًا.' });
}

async function exportCalendar(req, res, { getMatchesFn, verifyEntitlement }) {
  try {
    await verifyEntitlement(req);
    const selection = validateCalendarSelection(await readJsonBody(req));
    const fixtureSource = await getMatchesFn('?status=SCHEDULED');
    if (!fixtureSource?.configured) {
      throw new EntitlementError('FIXTURE_SOURCE_UNAVAILABLE', 503, 'The real fixture source must be configured before calendar export.');
    }
    const selectedMatches = selectCalendarMatches(fixtureSource.matches, selection);
    if (selectedMatches.length === 0) {
      throw new CalendarInputError('NO_MATCHES', 'No selected matches are available in the current real fixture schedule.');
    }
    const calendar = createCalendarIcs(selectedMatches);
    res.writeHead(200, {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="matchpulse-fixtures.ics"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(calendar);
  } catch (error) {
    calendarError(res, error);
  }
}

export function createHandler({ getMatchesFn = getMatches, verifyEntitlement = createEntitlementVerifier() } = {}) {
  return async function handler(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (requestUrl.pathname === '/api/health') return json(res, 200, { ok: true, provider: 'football-data.org', configured: Boolean(token) });
    if (requestUrl.pathname === '/api/matches') {
      try { return json(res, 200, await getMatchesFn(requestUrl.search || '?status=SCHEDULED')); }
      catch (error) { return json(res, 502, { matches: [], configured: Boolean(token), error: 'تعذر الوصول إلى مصدر المباريات حاليًا.', detail: error.message }); }
    }
    if (requestUrl.pathname === '/api/pro/calendar-export') {
      if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      return exportCalendar(req, res, { getMatchesFn, verifyEntitlement });
    }
    let path = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    path = normalize(path).replace(/^([.][.][/\\])+/, '');
    const file = join(root, 'public', path);
    if (!file.startsWith(join(root, 'public')) || !existsSync(file)) return json(res, 404, { error: 'Not found' });
    try { const data = await readFile(file); res.writeHead(200, { 'content-type': contentTypes[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(data); }
    catch { json(res, 500, { error: 'Unable to read resource' }); }
  };
}

export function createServer(options) {
  return http.createServer(createHandler(options));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer().listen(port, () => console.log(`MatchPulse-AI listening on ${port}`));
}
