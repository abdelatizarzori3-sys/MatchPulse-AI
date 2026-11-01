const encoder = new TextEncoder();

export class CalendarInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CalendarInputError';
    this.code = code;
  }
}

function requireString(value, field, maxLength = 160) {
  if (typeof value !== 'string') {
    throw new CalendarInputError('INVALID_REQUEST', `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new CalendarInputError('INVALID_REQUEST', `${field} is invalid.`);
  }
  return normalized;
}

function requireSourceText(value, field, maxLength = 160) {
  if (typeof value !== 'string') {
    throw new CalendarInputError('INVALID_SOURCE', `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) {
    throw new CalendarInputError('INVALID_SOURCE', `${field} is invalid.`);
  }
  return normalized;
}

function normalizeId(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') {
    throw new CalendarInputError('INVALID_REQUEST', 'matchIds must contain valid match identifiers.');
  }
  const id = String(value).trim();
  if (id.length > 80 || /[\u0000-\u001F\u007F]/.test(id)) {
    throw new CalendarInputError('INVALID_REQUEST', 'matchIds must contain valid match identifiers.');
  }
  return id;
}

export function validateCalendarSelection(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CalendarInputError('INVALID_REQUEST', 'A JSON export request is required.');
  }
  if (!Array.isArray(payload.matchIds) || payload.matchIds.length === 0 || payload.matchIds.length > 50) {
    throw new CalendarInputError('INVALID_REQUEST', 'Select between one and fifty matches.');
  }
  if (!Array.isArray(payload.favoriteTeams) || payload.favoriteTeams.length > 30) {
    throw new CalendarInputError('INVALID_REQUEST', 'favoriteTeams must be an array with at most thirty teams.');
  }

  const matchIds = [...new Set(payload.matchIds.map(normalizeId))];
  const favoriteTeams = [...new Set(payload.favoriteTeams.map((team) => requireString(team, 'favoriteTeams', 120)))];
  return { matchIds, favoriteTeams };
}

function matchTeamName(value, field) {
  return requireSourceText(value, field, 160);
}

function matchId(match) {
  return normalizeId(match?.id);
}

export function selectCalendarMatches(matches, selection) {
  if (!Array.isArray(matches)) {
    throw new CalendarInputError('INVALID_SOURCE', 'The fixture source did not return a match list.');
  }
  const selectedIds = new Set(selection.matchIds);
  const favoriteTeams = new Set(selection.favoriteTeams);

  return matches.filter((match) => {
    const id = matchId(match);
    if (!selectedIds.has(id)) return false;
    if (favoriteTeams.size === 0) return true;
    const home = matchTeamName(match.home, 'home');
    const away = matchTeamName(match.away, 'away');
    return favoriteTeams.has(home) || favoriteTeams.has(away);
  });
}

export function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function formatIcsUtc(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CalendarInputError('INVALID_SOURCE', 'A selected match has no valid UTC date.');
  }
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function stableUid(match) {
  const source = `${matchId(match)}|${match.utcDate}|${match.home}|${match.away}`;
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `matchpulse-${(hash >>> 0).toString(16)}@matchpulse-ai.local`;
}

export function foldIcsLine(line) {
  let current = '';
  let currentBytes = 0;
  const folded = [];

  for (const character of line) {
    const characterBytes = encoder.encode(character).byteLength;
    if (currentBytes + characterBytes > 75) {
      folded.push(current);
      current = ` ${character}`;
      currentBytes = 1 + characterBytes;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }
  folded.push(current);
  return folded;
}

function eventLines(match, stamp) {
  const home = matchTeamName(match.home, 'home');
  const away = matchTeamName(match.away, 'away');
  const competition = matchTeamName(match.competition, 'competition');
  const status = matchTeamName(match.status, 'status');
  return [
    'BEGIN:VEVENT',
    `UID:${stableUid(match)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcsUtc(match.utcDate)}`,
    `SUMMARY:${escapeIcsText(`${home} vs ${away}`)}`,
    `DESCRIPTION:${escapeIcsText(`${competition} · ${status}`)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
  ];
}

export function createCalendarIcs(matches, { now = new Date(), calendarName = 'MatchPulse fixtures' } = {}) {
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new CalendarInputError('NO_MATCHES', 'No selected matches are available for export.');
  }
  const stamp = formatIcsUtc(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MatchPulse-AI//Fixture Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(requireString(calendarName, 'calendarName', 120))}`,
  ];
  for (const match of matches) lines.push(...eventLines(match, stamp));
  lines.push('END:VCALENDAR');
  return lines.flatMap(foldIcsLine).join('\r\n') + '\r\n';
}
