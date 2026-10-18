import './env.ts';
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { RELOGIN } from '../moodle/session.ts';
import { ws } from '../moodle/ws.ts';
import { SESSION, stubFetch } from './helpers.ts';

afterEach(() => mock.restoreAll());

test('ws POSTs form-encoded params, token and wsfunction to the REST endpoint', async () => {
  const f = stubFetch(() => Response.json({ ok: 1 }));
  const out = await ws(SESSION, 'some_fn', { courseids: [3], flag: true });
  assert.deepEqual(out, { ok: 1 });

  const [url, init] = f.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(
    String(url),
    'https://campus.test/webservice/rest/server.php?moodlewsrestformat=json'
  );
  assert.equal(init.method, 'POST');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(String(init.body), 'courseids%5B0%5D=3&flag=1&wstoken=tok&wsfunction=some_fn');
});

test('ws works without params', async () => {
  const f = stubFetch(() => Response.json([]));
  assert.deepEqual(await ws(SESSION, 'fn'), []);
  assert.equal(
    String((f.mock.calls[0].arguments[1] as RequestInit).body),
    'wstoken=tok&wsfunction=fn'
  );
});

test('ws does not let params override the token or the function', async () => {
  const f = stubFetch(() => Response.json({}));
  await ws(SESSION, 'fn', { wstoken: 'evil', wsfunction: 'other' });
  const body = (f.mock.calls[0].arguments[1] as RequestInit).body as URLSearchParams;
  assert.deepEqual(body.getAll('wstoken'), ['tok']);
  assert.deepEqual(body.getAll('wsfunction'), ['fn']);
});

test('ws returns a null body as is', async () => {
  stubFetch(() => Response.json(null));
  assert.equal(await ws(SESSION, 'fn'), null);
});

test('ws turns a Moodle exception into an error naming the function', async () => {
  stubFetch(() => Response.json({ exception: 'x', errorcode: 'nope', message: 'Sin acceso' }));
  await assert.rejects(ws(SESSION, 'fn'), { message: 'fn: Sin acceso' });
});

test('ws reports an expired token with the relogin hint', async () => {
  stubFetch(() => Response.json({ exception: 'x', errorcode: 'invalidtoken', message: 'bad' }));
  await assert.rejects(ws(SESSION, 'fn'), { message: `La sesión del campus expiró: ${RELOGIN}.` });
});

test('ws reports a non-JSON response with the HTTP status', async () => {
  stubFetch(() => new Response('<html>', { status: 502 }));
  await assert.rejects(ws(SESSION, 'fn'), {
    message: 'fn: respuesta inválida del campus (HTTP 502)',
  });
});

test('ws propagates network failures', async () => {
  stubFetch(() => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(ws(SESSION, 'fn'), { message: 'fetch failed' });
});
