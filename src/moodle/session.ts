import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Session = { base: string; token: string; userid: number };

export const RELOGIN = 'corré `npx fiuba-mcp login`';

const DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'fiuba-mcp');
export const SESSION_FILE = join(DIR, 'session.json');

export async function loadSession(): Promise<Session> {
  try {
    return JSON.parse(await readFile(SESSION_FILE, 'utf8'));
  } catch {
    throw new Error(`No hay sesión del campus: ${RELOGIN}.`);
  }
}

export async function saveSession(session: Session): Promise<void> {
  await mkdir(DIR, { recursive: true, mode: 0o700 });
  await writeFile(SESSION_FILE, JSON.stringify(session), { mode: 0o600 });
  await chmod(SESSION_FILE, 0o600); // mode above is ignored when the file already exists
}
