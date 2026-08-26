import { describe, expect, it } from 'vitest';

describe('football data secret', () => {
  it('authenticates against the lightweight competitions endpoint', async () => {
    const token = process.env.FOOTBALL_DATA_TOKEN;
    expect(token).toBeTruthy();
    const response = await fetch('https://api.football-data.org/v4/competitions', {
      headers: { 'X-Auth-Token': token },
    });
    expect(response.status).toBe(200);
  }, 20_000);
});
