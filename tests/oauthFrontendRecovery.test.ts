import test from 'node:test';
import assert from 'node:assert/strict';
import {
  launchPlaidLink,
  recoverOwnedPlaidConnections,
  resumePlaidOAuthReturn,
} from '../src/platforms/web/services/openBanking';

const CALLBACK =
  'http://localhost:5173/oauth/plaid?oauth_state_id=9d5feadd-a873-43eb-97ba-422f35ce849b';

const jsonResponse = (payload: unknown, ok = true) => ({
  ok,
  async json() { return payload; },
}) as Response;

test('Plaid Link resume uses the original token and full received redirect before success', async () => {
  const previousWindow = globalThis.window;
  let capturedConfig: Record<string, unknown> | null = null;
  let resolved = false;
  try {
    globalThis.window = {
      Plaid: {
        create(config: Record<string, unknown>) {
          capturedConfig = config;
          return { open() {}, destroy() {} };
        },
      },
    } as unknown as Window & typeof globalThis;
    const pending = launchPlaidLink('link-original-token', CALLBACK).then((result) => {
      resolved = true;
      return result;
    });
    await Promise.resolve();
    assert.ok(capturedConfig);
    const config = capturedConfig as Record<string, unknown>;
    assert.equal(resolved, false);
    assert.equal(config.token, 'link-original-token');
    assert.equal(config.receivedRedirectUri, CALLBACK);
    (config.onSuccess as (
      publicToken: string,
      metadata: { accounts: Array<{ id: string }> }
    ) => void)('public-once', { accounts: [{ id: 'account-1' }] });
    assert.equal((await pending).publicToken, 'public-once');
  } finally {
    globalThis.window = previousWindow;
  }
});

test('OAuth frontend resume creates no second Link session and exchanges only after Link success', async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  let receivedRedirectUri: string | undefined;
  let completionCalls = 0;
  try {
    globalThis.window = {
      location: { pathname: '/oauth/plaid', search: CALLBACK.slice(CALLBACK.indexOf('?')), href: CALLBACK },
      history: { replaceState(_state: unknown, _title: string, url?: string | URL | null) {
        assert.equal(url, '/');
      } },
      Plaid: {
        create(config: Record<string, unknown>) {
          receivedRedirectUri = config.receivedRedirectUri as string | undefined;
          return {
            open() {
              (config.onSuccess as (
                publicToken: string,
                metadata: { accounts: Array<{ id: string }> }
              ) => void)('public-once', { accounts: [{ id: 'account-1' }] });
            },
            destroy() {},
          };
        },
      },
    } as unknown as Window & typeof globalThis;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url === '/api/open-banking/oauth/resume') {
        return jsonResponse({
          sessionId: 'link-session-1', providerName: 'plaid', providerEnvironment: 'sandbox',
          status: 'redirect-required', linkToken: 'link-original-token', mode: 'create',
          connectionId: null, intent: 'connect', receivedRedirectUri: CALLBACK,
        });
      }
      if (url === '/api/open-banking/connection/complete') {
        completionCalls += 1;
        return jsonResponse({ connection: { id: 'connection-1' }, accounts: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const result = await resumePlaidOAuthReturn();
    assert.equal(result?.connection.id, 'connection-1');
    assert.equal(receivedRedirectUri, CALLBACK);
    assert.equal(completionCalls, 1);
    assert.equal(calls.includes('/api/open-banking/session/create'), false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});

test('orphan recovery fetches only active backend connections missing locally', async () => {
  const previousFetch = globalThis.fetch;
  const refreshed: string[] = [];
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/open-banking/connections') {
        return jsonResponse({ connections: [
          { id: 'active-missing', status: 'active', recoverySafe: true, providerEnvironment: 'sandbox' },
          { id: 'active-local', status: 'active', recoverySafe: true, providerEnvironment: 'sandbox' },
          { id: 'revoked', status: 'provider_revoked', recoverySafe: false, providerEnvironment: 'sandbox' },
          { id: 'disconnected', status: 'disconnected', recoverySafe: false, providerEnvironment: 'sandbox' },
        ] });
      }
      if (url === '/api/open-banking/connection/refresh') {
        const body = JSON.parse(String(init?.body)) as { connectionId: string };
        refreshed.push(body.connectionId);
        return jsonResponse({ connection: { id: body.connectionId }, accounts: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
    const recovered = await recoverOwnedPlaidConnections(new Set(['active-local']));
    assert.deepEqual(refreshed, ['active-missing']);
    assert.equal(recovered[0]?.connection.id, 'active-missing');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
