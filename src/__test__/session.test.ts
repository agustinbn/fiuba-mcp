import { CONFIG_HOME } from './env.ts';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { promisify } from 'node:util';
import { loadSession, RELOGIN, SESSION_FILE, saveSession } from '../moodle/session.ts';
import { SESSION } from './helpers.ts';

beforeEach(() => rm(join(CONFIG_HOME, 'fiuba-mcp'), { recursive: true, force: true }));

test('session file lives under XDG_CONFIG_HOME/fiuba-mcp', () => {
  assert.equal(SESSION_FILE, join(CONFIG_HOME, 'fiuba-mcp', 'session.json'));
});

test('without XDG_CONFIG_HOME the session file defaults to ~/.config/fiuba-mcp', async () => {
  const home = join(CONFIG_HOME, 'home');
  const { XDG_CONFIG_HOME: _, ...env } = { ...process.env, HOME: home, USERPROFILE: home };
  const entry = new URL('../moodle/session.ts', import.meta.url).href;
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', `console.log((await import('${entry}')).SESSION_FILE)`],
    { env }
  );
  assert.equal(stdout.trim(), join(home, '.config', 'fiuba-mcp', 'session.json'));
});

test('saveSession/loadSession round-trip', async () => {
  await saveSession(SESSION);
  assert.deepEqual(await loadSession(), SESSION);
});

test('session file is 0600 and its directory 0700', async () => {
  await saveSession(SESSION);
  assert.equal((await stat(SESSION_FILE)).mode & 0o777, 0o600);
  assert.equal((await stat(dirname(SESSION_FILE))).mode & 0o777, 0o700);
});

test('saveSession tightens the mode of a pre-existing world-readable file', async () => {
  await mkdir(dirname(SESSION_FILE), { recursive: true });
  await writeFile(SESSION_FILE, '{}', { mode: 0o644 });
  await chmod(SESSION_FILE, 0o644);
  await saveSession(SESSION);
  assert.equal((await stat(SESSION_FILE)).mode & 0o777, 0o600);
});

test('saveSession overwrites the previous session', async () => {
  await saveSession(SESSION);
  await saveSession({ ...SESSION, token: 'new' });
  assert.equal(JSON.parse(await readFile(SESSION_FILE, 'utf8')).token, 'new');
});

test('loadSession without a file asks to log in again', async () => {
  await assert.rejects(loadSession(), { message: `No hay sesión del campus: ${RELOGIN}.` });
});

test('loadSession with a corrupt file asks to log in again', async () => {
  await mkdir(dirname(SESSION_FILE), { recursive: true });
  await writeFile(SESSION_FILE, '{not json');
  await assert.rejects(loadSession(), /No hay sesión del campus/);
});
