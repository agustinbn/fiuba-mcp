import './env.ts';
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { fetchFile } from '../moodle/files.ts';
import { RELOGIN } from '../moodle/session.ts';
import { SESSION, stubFetch } from './helpers.ts';

const MAX = 25 * 1024 * 1024;
const FILE = 'https://campus.test/pluginfile.php/5/mod_resource/content/1/a.txt';

afterEach(() => mock.restoreAll());

test('fetchFile rejects other origins without sending the token', async () => {
  const f = stubFetch(() => new Response('x'));
  for (const url of [
    'https://evil.test/pluginfile.php/a.txt',
    'https://campus.test.evil.test/pluginfile.php/a.txt', // lookalike host
    'http://campus.test/pluginfile.php/a.txt', // other scheme
    'https://campus.test:8443/pluginfile.php/a.txt', // other port
    'https://user@evil.test/pluginfile.php/a.txt',
  ])
    await assert.rejects(fetchFile(SESSION, url), {
      message: 'Solo se pueden leer archivos de https://campus.test',
    });
  assert.equal(f.mock.callCount(), 0);
});

test('fetchFile rejects malformed URLs', async () => {
  stubFetch(() => new Response('x'));
  await assert.rejects(fetchFile(SESSION, 'not a url'), TypeError);
});

test('fetchFile rewrites /pluginfile.php to the webservice path and sends the token', async () => {
  const f = stubFetch(() => new Response('hola', { headers: { 'content-type': 'text/plain' } }));
  const r = await fetchFile(SESSION, FILE);
  const [url, init] = f.mock.calls[0].arguments as [URL, RequestInit];
  assert.equal(
    String(url),
    'https://campus.test/webservice/pluginfile.php/5/mod_resource/content/1/a.txt?token=tok'
  );
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(new TextDecoder().decode(r.buf), 'hola');
  assert.equal(r.type, 'text/plain');
  assert.equal(r.path, '/webservice/pluginfile.php/5/mod_resource/content/1/a.txt');
});

test('fetchFile overrides a token supplied in the URL', async () => {
  const f = stubFetch(() => new Response('x'));
  await fetchFile(SESSION, `${FILE}?token=attacker&forcedownload=1`);
  const url = (f.mock.calls[0].arguments as [URL])[0];
  assert.deepEqual(url.searchParams.getAll('token'), ['tok']);
  assert.equal(url.searchParams.get('forcedownload'), '1');
});

test('fetchFile only rewrites a leading /pluginfile.php', async () => {
  const f = stubFetch(() => new Response('x'));
  await fetchFile(SESSION, 'https://campus.test/webservice/pluginfile.php/a.txt');
  await fetchFile(SESSION, 'https://campus.test/x/pluginfile.php/a.txt');
  const paths = f.mock.calls.map(c => (c.arguments as [URL])[0].pathname);
  assert.deepEqual(paths, ['/webservice/pluginfile.php/a.txt', '/x/pluginfile.php/a.txt']);
});

test('fetchFile accepts a session base with a path-free origin only', async () => {
  const f = stubFetch(() => new Response('x'));
  await fetchFile({ ...SESSION, base: 'https://campus.test/' }, FILE);
  assert.equal(f.mock.callCount(), 1);
});

test('fetchFile returns an empty type when the response has no content-type', async () => {
  stubFetch(() => new Response(new Uint8Array([1, 2, 3])));
  const r = await fetchFile(SESSION, FILE);
  assert.equal(r.type, '');
  assert.deepEqual([...r.buf], [1, 2, 3]);
});

test('fetchFile fails on HTTP errors', async () => {
  stubFetch(() => new Response('nope', { status: 404 }));
  await assert.rejects(fetchFile(SESSION, FILE), {
    message: 'No se pudo descargar el archivo (HTTP 404)',
  });
});

test('fetchFile propagates redirect/network failures', async () => {
  stubFetch(() => {
    throw new TypeError('unexpected redirect');
  });
  await assert.rejects(fetchFile(SESSION, FILE), { message: 'unexpected redirect' });
});

test('fetchFile rejects files whose content-length exceeds 25 MB', async () => {
  stubFetch(() => new Response('x', { headers: { 'content-length': String(MAX + 1) } }));
  await assert.rejects(fetchFile(SESSION, FILE), { message: 'Archivo demasiado grande (>25 MB)' });
});

test('fetchFile accepts a content-length of exactly 25 MB', async () => {
  stubFetch(() => new Response('x', { headers: { 'content-length': String(MAX) } }));
  assert.equal((await fetchFile(SESSION, FILE)).buf.byteLength, 1);
});

test('fetchFile rejects an oversized body even if content-length is missing or lies', async () => {
  stubFetch(() => new Response(new Uint8Array(MAX + 1)));
  await assert.rejects(fetchFile(SESSION, FILE), { message: 'Archivo demasiado grande (>25 MB)' });
});

test('fetchFile accepts a body of exactly 25 MB', async () => {
  stubFetch(() => new Response(new Uint8Array(MAX)));
  assert.equal((await fetchFile(SESSION, FILE)).buf.byteLength, MAX);
});

const jsonRes = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('fetchFile reports an expired token from a JSON error body', async () => {
  stubFetch(() => jsonRes({ error: 'x', errorcode: 'invalidtoken' }));
  await assert.rejects(fetchFile(SESSION, FILE), { message: `La sesión expiró: ${RELOGIN}.` });
});

test('fetchFile surfaces other JSON errors, preferring `error` over `message`', async () => {
  stubFetch(() => jsonRes({ errorcode: 'x', error: 'Sin permiso', message: 'otro' }));
  await assert.rejects(fetchFile(SESSION, FILE), { message: 'Sin permiso' });
  stubFetch(() => jsonRes({ errorcode: 'x', message: 'Solo mensaje' }));
  await assert.rejects(fetchFile(SESSION, FILE), { message: 'Solo mensaje' });
});

test('fetchFile still reports an error that has an errorcode but no text', async () => {
  stubFetch(() => jsonRes({ errorcode: 'weird' }));
  await assert.rejects(fetchFile(SESSION, FILE), { message: 'weird' });
});

test('fetchFile returns legitimate JSON files and tolerates invalid JSON', async () => {
  stubFetch(() => jsonRes({ a: 1 }));
  assert.equal((await fetchFile(SESSION, FILE)).type, 'application/json');
  stubFetch(() => new Response('{broken', { headers: { 'content-type': 'application/json' } }));
  assert.equal((await fetchFile(SESSION, FILE)).type, 'application/json');
  stubFetch(() => jsonRes(null));
  assert.equal((await fetchFile(SESSION, FILE)).type, 'application/json');
});

test('fetchFile does not parse non-JSON bodies as errors', async () => {
  stubFetch(() => new Response('{"errorcode":"x"}', { headers: { 'content-type': 'text/plain' } }));
  assert.equal((await fetchFile(SESSION, FILE)).type, 'text/plain');
});
