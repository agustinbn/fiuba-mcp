import { CONFIG_HOME } from './env.ts';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { loginCli } from '../cli/login.ts';
import { SESSION_FILE } from '../moodle/session.ts';
import { stubFetch } from './helpers.ts';

const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin')!;
const realIsTTY = process.stderr.isTTY;

/** A fake terminal. `script` maps each prompt the CLI prints to what the "user" types. */
function terminal(script: Record<string, string | string[]>, isTTY = true) {
  const stdin: any = new PassThrough();
  stdin.isTTY = isTTY;
  stdin.setRawMode = mock.fn();
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
  process.stderr.isTTY = false; // plain-line readline
  const prompts: string[] = [];
  mock.method(process.stderr, 'write', (text: string) => {
    prompts.push(text);
    if (text in script)
      [script[text]].flat().forEach((part, i) => setTimeout(() => stdin.write(part), i * 5));
    return true;
  });
  return { stdin, prompts };
}

const out: string[] = [];
beforeEach(() => {
  out.length = 0;
  mock.method(console, 'log', (...a: unknown[]) => out.push(a.join(' ')));
  delete process.env.FIUBA_CAMPUS_URL;
  return rm(join(CONFIG_HOME, 'fiuba-mcp'), { recursive: true, force: true });
});
afterEach(() => {
  mock.restoreAll();
  Object.defineProperty(process, 'stdin', realStdin);
  process.stderr.isTTY = realIsTTY;
  delete process.env.FIUBA_CAMPUS_URL;
});

function campus(functions: string[] = []) {
  return stubFetch(url =>
    url.pathname === '/login/token.php'
      ? Response.json({ token: 'T' })
      : Response.json({ userid: 3, fullname: 'Ana', functions: functions.map(name => ({ name })) })
  );
}

test('login needs an interactive terminal', async () => {
  terminal({}, false);
  const f = campus();
  await assert.rejects(loginCli(), { message: '`login` necesita una terminal interactiva.' });
  assert.equal(f.mock.callCount(), 0);
});

test('login prompts for user and hidden password, then stores the session', async () => {
  const t = terminal({ 'Usuario: ': '  ana  \n', 'Contraseña: ': 'abcd\u007fx\by\r' });
  const f = campus();
  await loginCli();

  const body = String((f.mock.calls[0].arguments[1] as RequestInit).body);
  assert.equal(body, 'username=ana&password=abcy&service=moodle_mobile_app'); // DEL and BS edit the buffer
  assert.equal(
    String(f.mock.calls[0].arguments[0]),
    'https://campusgrado.fi.uba.ar/login/token.php'
  );
  assert.deepEqual(JSON.parse(await readFile(SESSION_FILE, 'utf8')), {
    base: 'https://campusgrado.fi.uba.ar',
    token: 'T',
    userid: 3,
  });
  assert.ok(!t.prompts.join('').includes('abcy')); // the password is never echoed
  assert.equal(t.stdin.setRawMode.mock.calls[0].arguments[0], true);
  assert.equal(t.stdin.setRawMode.mock.calls.at(-1).arguments[0], false);
  assert.equal(out[0], 'Campus: https://campusgrado.fi.uba.ar');
  assert.equal(
    out[1],
    `Listo, Ana. Token guardado en ${SESSION_FILE} (la contraseña no se guarda).`
  );
  assert.match(out[2], /^Aviso: el campus no habilita core_enrol_get_users_courses, /);
});

test('login accepts a password typed across several terminal chunks', async () => {
  terminal({ 'Usuario: ': 'ana\n', 'Contraseña: ': ['ab', 'c', 'd\r'] });
  const f = campus();
  await loginCli();
  assert.match(String((f.mock.calls[0].arguments[1] as RequestInit).body), /password=abcd&/);
});

test('login stops at the first newline of the password input', async () => {
  terminal({ 'Usuario: ': 'ana\n', 'Contraseña: ': 'pw\nignored' });
  const f = campus();
  await loginCli();
  assert.match(String((f.mock.calls[0].arguments[1] as RequestInit).body), /password=pw&/);
});

test('login honours FIUBA_CAMPUS_URL and strips trailing slashes', async () => {
  process.env.FIUBA_CAMPUS_URL = 'https://campusposgrado.fi.uba.ar//';
  terminal({ 'Usuario: ': 'ana\n', 'Contraseña: ': 'pw\r' });
  const f = campus();
  await loginCli();
  assert.equal(
    String(f.mock.calls[0].arguments[0]),
    'https://campusposgrado.fi.uba.ar/login/token.php'
  );
  assert.equal(out[0], 'Campus: https://campusposgrado.fi.uba.ar');
});

test('login prints no warning when every function is enabled', async () => {
  terminal({ 'Usuario: ': 'ana\n', 'Contraseña: ': 'pw\r' });
  campus([
    'core_enrol_get_users_courses',
    'core_course_get_contents',
    'core_calendar_get_action_events_by_timesort',
    'mod_assign_get_assignments',
    'mod_assign_get_submission_status',
    'mod_forum_get_forum_discussions',
    'mod_forum_get_discussion_posts',
    'gradereport_user_get_grade_items',
  ]);
  await loginCli();
  assert.equal(out.length, 2);
});

test('Ctrl-C at the password prompt cancels, restores the terminal and stores nothing', async () => {
  const t = terminal({ 'Usuario: ': 'ana\n', 'Contraseña: ': 'ab\u0003' });
  const f = campus();
  await assert.rejects(loginCli(), { message: 'Cancelado' });
  assert.equal(f.mock.callCount(), 0);
  assert.equal(t.stdin.setRawMode.mock.calls.at(-1).arguments[0], false);
  await assert.rejects(readFile(SESSION_FILE), { code: 'ENOENT' });
});

test('wrong credentials surface the campus error', async () => {
  terminal({ 'Usuario: ': 'ana\n', 'Contraseña: ': 'bad\r' });
  stubFetch(() => Response.json({ error: 'Credenciales inválidas' }));
  await assert.rejects(loginCli(), { message: 'Credenciales inválidas' });
});
