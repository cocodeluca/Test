import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBrokerApiApplication } from '../server/apiApplication';
import { createStandaloneServer } from '../server/standaloneServer';
import type { OpenBankingRequestAuthenticator } from '../server/openBankingAuth';
import type { OpenBankingService } from '../server/openBankingService';
import type { ServerAuthService } from '../server/serverAuth';

test('standalone serves built assets and SPA routes without crossing API or dist boundaries', async (context) => {
  const parent = await mkdtemp(path.join(tmpdir(), 're-static-'));
  context.after(async () => rm(parent, { recursive: true, force: true }));
  const dist = path.join(parent, 'dist');
  await mkdir(path.join(dist, 'assets'), { recursive: true });
  await mkdir(path.join(dist, 'property-images'), { recursive: true });
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><div id="root">synthetic shell</div>');
  await writeFile(path.join(dist, 'assets', 'index-AbCd1234.js'), 'export const synthetic = true;');
  await writeFile(path.join(dist, 'assets', 'index-AbCd1234.css'), 'body{color:red}');
  await writeFile(path.join(dist, 'assets', 'index-AbCd1234.js.map'), 'hidden map');
  await writeFile(path.join(dist, 'property-images', 'photo.jpg'), 'synthetic image');
  await writeFile(path.join(dist, '.env'), 'hidden env');
  await writeFile(path.join(dist, 'server.ts'), 'hidden source');
  await writeFile(path.join(parent, 'outside.txt'), 'outside dist');
  let linkedOutside = false;
  try {
    await symlink(path.join(parent, 'outside.txt'), path.join(dist, 'assets', 'outside.jpg'));
    linkedOutside = true;
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
  }
  const application = createBrokerApiApplication({
    authService: {} as ServerAuthService,
    openBankingService: {} as OpenBankingService,
    openBankingAuthenticator: {} as OpenBankingRequestAuthenticator,
  });
  const server = createStandaloneServer({
    application, frontendIndexHtmlPath: path.join(dist, 'index.html'),
  });
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const get = async (target: string) => {
    const response = await fetch(`http://127.0.0.1:${port}${target}`);
    return { status: response.status, headers: response.headers, body: await response.text() };
  };
  const rawGet = (target: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path: target, method: 'GET' }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on('error', reject);
    request.end();
  });

  const root = await get('/');
  assert.equal(root.status, 200);
  assert.match(root.body, /synthetic shell/);
  assert.match(root.headers.get('content-type') ?? '', /text\/html/);
  assert.equal(root.headers.get('cache-control'), 'no-cache');
  assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await get('/index.html')).body, root.body);

  for (const route of ['/properties/one', '/reports']) {
    const response = await get(route);
    assert.equal(response.status, 200);
    assert.equal(response.body, root.body);
  }
  for (const route of ['/oauth/plaid', '/oauth/plaid?oauth_state_id=synthetic']) {
    const response = await get(route);
    assert.equal(response.status, 200);
    assert.equal(response.body, root.body);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }

  for (const [asset, type] of [
    ['/assets/index-AbCd1234.js', 'text/javascript'],
    ['/assets/index-AbCd1234.css', 'text/css'],
  ]) {
    const response = await get(asset);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', new RegExp(type));
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  }
  const image = await get('/property-images/photo.jpg');
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(image.headers.get('cache-control'), 'no-cache');

  const health = await get('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { status: 'ready' });
  const unknownApi = await get('/api/unknown/path');
  assert.equal(unknownApi.status, 404);
  assert.match(unknownApi.headers.get('content-type') ?? '', /application\/json/);
  assert.doesNotMatch(unknownApi.body, /synthetic shell/);

  for (const route of [
    '/assets/missing.js', '/assets/missing', '/assets/', '/property-images/', '/missing.css',
    '/assets/index-AbCd1234.js.map', '/.env', '/server.ts',
    '/assets/../../outside.txt', '/%2e%2e/outside.txt',
    '/assets/%2e%2e/%2e%2e/outside.txt', '/assets/%2foutside.txt',
    '/%252e%252e/outside.txt',
  ]) {
    const response = await rawGet(route);
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(response.body, /synthetic shell|hidden|outside dist/, route);
  }
  if (linkedOutside) assert.equal((await get('/assets/outside.jpg')).status, 404);
});
