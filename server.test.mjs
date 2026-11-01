import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.mjs';
import { EntitlementError } from './lib/entitlements.mjs';

const realFixtures = [{ id: 200, utcDate: '2026-11-01T14:30:00.000Z', competition: 'Botola Pro', home: 'Raja', away: 'Wydad', status: 'SCHEDULED' }];

async function withServer(options, callback) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('project has a real-data provider contract and no seeded fixture list', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./server.mjs', import.meta.url), 'utf8'));
  assert.match(source, /football-data\.org/);
  assert.match(source, /FOOTBALL_DATA_TOKEN/);
  assert.match(source, /matches: \[\]/);
});

test('prediction percentages remain a probability distribution', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./server.mjs', import.meta.url), 'utf8'));
  assert.match(source, /prediction: probability\(match\)/);
  assert.match(source, /home: Math\.round/);
  assert.match(source, /draw: Math\.round/);
  assert.match(source, /away: Math\.round/);
});

test('a free or unverified request cannot download a calendar', async () => {
  await withServer({
    getMatchesFn: async () => ({ configured: true, matches: realFixtures }),
    verifyEntitlement: async () => { throw new EntitlementError('ENTITLEMENT_REQUIRED', 403, 'Active Pro required.'); },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pro/calendar-export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchIds: [200], favoriteTeams: [] }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'ENTITLEMENT_REQUIRED');
  });
});

test('a test-injected verified entitlement can export only fixtures from the real provider result', async () => {
  await withServer({
    getMatchesFn: async (query) => {
      assert.equal(query, '?status=SCHEDULED');
      return { configured: true, matches: realFixtures };
    },
    verifyEntitlement: async () => ({ subject: 'test-user-42' }),
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pro/calendar-export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchIds: [200], favoriteTeams: ['Raja'] }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/calendar/);
    const calendar = await response.text();
    assert.match(calendar, /DTSTART:20261101T143000Z\r\n/);
    assert.match(calendar, /SUMMARY:Raja vs Wydad\r\n/);
  });
});
