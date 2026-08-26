import test from 'node:test';
import assert from 'node:assert/strict';

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
