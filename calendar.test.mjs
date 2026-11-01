import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarInputError, createCalendarIcs, selectCalendarMatches, validateCalendarSelection } from './lib/calendar.mjs';

const fixtures = [
  { id: 41, utcDate: '2026-11-03T18:05:06.000Z', competition: 'League, One', home: 'Atlas;\\North', away: 'Rif\nUnited', status: 'SCHEDULED' },
  { id: 42, utcDate: '2026-11-04T20:00:00.000Z', competition: 'League Two', home: 'Fes', away: 'Tangier', status: 'SCHEDULED' },
];

test('creates a UTC, CRLF ICS file and escapes fixture text', () => {
  const selection = validateCalendarSelection({ matchIds: [41], favoriteTeams: ['Atlas;\\North'] });
  const selected = selectCalendarMatches(fixtures, selection);
  const ics = createCalendarIcs(selected, { now: new Date('2026-10-31T09:08:07.000Z') });

  assert.ok(ics.endsWith('\r\n'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/m);
  assert.match(ics, /DTSTAMP:20261031T090807Z\r\n/);
  assert.match(ics, /DTSTART:20261103T180506Z\r\n/);
  assert.match(ics, /SUMMARY:Atlas\\;\\\\North vs Rif\\nUnited\r\n/);
  assert.match(ics, /DESCRIPTION:League\\, One · SCHEDULED\r\n/);
  assert.ok(!ics.replace(/\r\n/g, '').includes('\n'));
  for (const line of ics.split('\r\n').filter(Boolean)) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});

test('favorite-team filtering retains only selected real fixtures involving a favorite', () => {
  const selection = validateCalendarSelection({ matchIds: [41, 42], favoriteTeams: ['Tangier'] });
  assert.deepEqual(selectCalendarMatches(fixtures, selection).map((fixture) => fixture.id), [42]);
});

test('rejects empty and malformed calendar selections', () => {
  assert.throws(() => validateCalendarSelection({ matchIds: [], favoriteTeams: [] }), CalendarInputError);
  assert.throws(() => validateCalendarSelection({ matchIds: [41], favoriteTeams: ['bad\nteam'] }), CalendarInputError);
  assert.throws(() => validateCalendarSelection({ matchIds: [41], favoriteTeams: 'Atlas' }), CalendarInputError);
});
