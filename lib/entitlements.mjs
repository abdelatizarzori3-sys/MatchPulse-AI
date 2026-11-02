export const CALENDAR_EXPORT_PRODUCT = 'calendar_export';

export class EntitlementError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'EntitlementError';
    this.code = code;
    this.status = status;
  }
}

function configurationError() {
  return new EntitlementError(
    'PURCHASE_SETUP_REQUIRED',
    503,
    'Calendar export is unavailable until a server-side purchase and entitlement verifier is configured.',
  );
}

function deniedError() {
  return new EntitlementError(
    'ENTITLEMENT_REQUIRED',
    403,
    'An active, unexpired Pro subscription is required for calendar export.',
  );
}

function parseFutureDate(value) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateVerifierUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname === 'example' || url.hostname.endsWith('.example')) return null;
    return url;
  } catch {
    return null;
  }
}

function hasUsableServiceToken(value) {
  return typeof value === 'string'
    && value.trim().length >= 16
    && !/^(replace|your|change)[_-]/i.test(value.trim());
}

function authorizationFrom(request) {
  const header = request?.headers?.authorization;
  return typeof header === 'string' && /^Bearer\s+\S+$/i.test(header) ? header : '';
}

function isActiveEntitlement(body, now) {
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const entitlement = body?.entitlement;
  const expiresAt = parseFutureDate(entitlement?.expiresAt);
  if (!subject || subject.length > 256 || !entitlement || entitlement.product !== CALENDAR_EXPORT_PRODUCT) return false;
  if (entitlement.status !== 'active' || entitlement.cancelledAt || entitlement.revokedAt) return false;
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime());
}

export function createEntitlementVerifier({
  verifierUrl = process.env.ENTITLEMENT_VERIFIER_URL,
  serviceToken = process.env.ENTITLEMENT_VERIFIER_TOKEN,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  const endpoint = validateVerifierUrl(verifierUrl);

  return async function verifyProEntitlement(request) {
    if (!endpoint || !hasUsableServiceToken(serviceToken)) {
      throw configurationError();
    }
    const authorization = authorizationFrom(request);
    if (!authorization) {
      throw new EntitlementError('AUTHENTICATION_REQUIRED', 401, 'Sign in before exporting a Pro calendar.');
    }

    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization,
          'content-type': 'application/json',
          'x-matchpulse-entitlement-token': serviceToken,
        },
        body: JSON.stringify({ product: CALENDAR_EXPORT_PRODUCT }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new EntitlementError('ENTITLEMENT_UNAVAILABLE', 503, 'Subscription verification is temporarily unavailable.');
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw deniedError();
      throw new EntitlementError('ENTITLEMENT_UNAVAILABLE', 503, 'Subscription verification is temporarily unavailable.');
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new EntitlementError('ENTITLEMENT_UNAVAILABLE', 503, 'Subscription verification returned an invalid response.');
    }
    if (!isActiveEntitlement(body, now())) throw deniedError();
    return { subject: body.subject.trim() };
  };
}
