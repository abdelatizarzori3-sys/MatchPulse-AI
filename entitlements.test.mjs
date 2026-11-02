import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntitlementVerifier, EntitlementError } from './lib/entitlements.mjs';

const request = { headers: { authorization: 'Bearer user-session-token' } };
const serviceToken = 'test-server-token-only-not-a-production-secret';
const now = () => new Date('2026-10-31T09:00:00.000Z');

function verifierWith(body, status = 200) {
  return createEntitlementVerifier({
    verifierUrl: 'https://entitlements.example.test/verify',
    serviceToken,
    now,
    fetchImpl: async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  });
}

test('fails closed when entitlement verification is not configured', async () => {
  const verify = createEntitlementVerifier({ verifierUrl: '', serviceToken: '' });
  await assert.rejects(() => verify(request), (error) => error instanceof EntitlementError && error.code === 'PURCHASE_SETUP_REQUIRED' && error.status === 503);

  const templateValues = createEntitlementVerifier({
    verifierUrl: 'https://your-entitlement-service.example/verify',
    serviceToken: 'replace_with_a_server_to_server_secret',
  });
  await assert.rejects(() => templateValues(request), (error) => error instanceof EntitlementError && error.code === 'PURCHASE_SETUP_REQUIRED' && error.status === 503);
});

test('accepts only an active, unexpired and uncancelled calendar entitlement', async () => {
  const verify = verifierWith({ subject: 'user-123', entitlement: { product: 'calendar_export', status: 'active', expiresAt: '2026-11-01T09:00:00.000Z' } });
  assert.deepEqual(await verify(request), { subject: 'user-123' });

  const cancelled = verifierWith({ subject: 'user-123', entitlement: { product: 'calendar_export', status: 'active', expiresAt: '2026-11-01T09:00:00.000Z', cancelledAt: '2026-10-30T09:00:00.000Z' } });
  await assert.rejects(() => cancelled(request), (error) => error instanceof EntitlementError && error.code === 'ENTITLEMENT_REQUIRED');

  const expired = verifierWith({ subject: 'user-123', entitlement: { product: 'calendar_export', status: 'active', expiresAt: '2026-10-30T09:00:00.000Z' } });
  await assert.rejects(() => expired(request), (error) => error instanceof EntitlementError && error.code === 'ENTITLEMENT_REQUIRED');
});
