import { CONFIG_HOME } from './env.ts';
import assert from 'node:assert/strict';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { DEFAULT_BASE, login } from '../moodle/login.ts';
import { SESSION_FILE } from '../moodle/session.ts';
import { stubFetch } from './helpers.ts';

const BASE = 'https://campus.test';
const ALL = [
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'core_calendar_get_action_events_by_timesort',
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  'mod_forum_get_forum_discussions',
  'mod_forum_get_discussion_posts',
  'gradereport_user_get_grade_items',
];

beforeEach(() => rm(join(CONFIG_HOME, 'fiuba-mcp'), { recursive: true, force: true }));
afterEach(() => mock.restoreAll());

/** token.php answers `token`; the site info call answers `info`. */
function campus(token: Response | (() => Response), info: unknown = {}) {
  return stubFetch(url =>
    url.pathname === '/login/token.php'
      ? typeof token === 'function'
        ? token()
        : token
      : Response.json(info)
  );
}

const noSession = () => assert.rejects(stat(SESSION_FILE), { code: 'ENOENT' });

test('default campus is grado', () => {
  assert.equal(DEFAULT_BASE, 'https://campusgrado.fi.uba.ar');
});

test('login exchanges credentials for a token and stores the session without the password', async () => {
  const f = campus(Response.json({ token: 'T0K' }), {
    userid: 42,
    fullname: 'Ana Pérez',
    functions: ALL.map(name => ({ name })),
  });
  const r = await login(BASE, 'ana', 's3cret');
  assert.deepEqual(r, { fullname: 'Ana Pérez', file: SESSION_FILE, missing: [] });

  const [url, init] = f.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(String(url), `${BASE}/login/token.php`);
  assert.equal(init.method, 'POST');
  assert.equal(String(init.body), 'username=ana&password=s3cret&service=moodle_mobile_app');
  const siteInfo = f.mock.calls[1].arguments[1] as RequestInit;
  assert.equal(
    String((f.mock.calls[1].arguments as [string])[0]),
    `${BASE}/webservice/rest/server.php?moodlewsrestformat=json`
  );
  assert.equal((siteInfo.body as URLSearchParams).get('wstoken'), 'T0K');
  assert.equal(
    (siteInfo.body as URLSearchParams).get('wsfunction'),
    'core_webservice_get_site_info'
  );

  const raw = await readFile(SESSION_FILE, 'utf8');
  assert.deepEqual(JSON.parse(raw), { base: BASE, token: 'T0K', userid: 42 });
  assert.ok(!raw.includes('s3cret'));
  assert.equal((await stat(SESSION_FILE)).mode & 0o777, 0o600);
});

test('login lists the needed functions the campus has disabled', async () => {
  campus(Response.json({ token: 't' }), {
    userid: 1,
    fullname: 'X',
    functions: [{ name: 'mod_assign_get_assignments' }, { name: 'unrelated_fn' }],
  });
  const { missing } = await login(BASE, 'u', 'p');
  assert.deepEqual(
    missing,
    ALL.filter(f => f !== 'mod_assign_get_assignments')
  );
});

test('login reports every function as missing when the site lists none', async () => {
  campus(Response.json({ token: 't' }), { userid: 1, fullname: 'X' });
  assert.deepEqual((await login(BASE, 'u', 'p')).missing, ALL);
});

test('login surfaces the campus error and stores nothing', async () => {
  campus(Response.json({ error: 'Usuario o contraseña inválidos', errorcode: 'invalidlogin' }));
  await assert.rejects(login(BASE, 'u', 'bad'), { message: 'Usuario o contraseña inválidos' });
  await noSession();
});

test('login with an empty answer fails with a generic message', async () => {
  campus(Response.json({}));
  await assert.rejects(login(BASE, 'u', 'p'), { message: 'Login fallido' });
  await noSession();
});

test('login with a non-JSON answer reports the HTTP status', async () => {
  campus(new Response('<html>', { status: 503 }));
  await assert.rejects(login(BASE, 'u', 'p'), { message: 'HTTP 503' });
  await noSession();
});

test('login does not store the session if the site info call fails', async () => {
  campus(Response.json({ token: 't' }), { exception: 'x', errorcode: 'e', message: 'caído' });
  await assert.rejects(login(BASE, 'u', 'p'), { message: 'core_webservice_get_site_info: caído' });
  await noSession();
});

test('login propagates network failures', async () => {
  stubFetch(() => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(login(BASE, 'u', 'p'), { message: 'fetch failed' });
  await noSession();
});
