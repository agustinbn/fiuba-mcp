import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_BASE = 'https://campusgrado.fi.uba.ar';
const DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'fiuba-mcp');
const FILE = join(DIR, 'session.json');
const MAX_FILE = 25 * 1024 * 1024;
const RELOGIN = 'corré `npx fiuba-mcp login`';

// Functions the tools call; checked at login so a disabled one fails early.
const NEEDED = [
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'core_calendar_get_action_events_by_timesort',
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  'mod_forum_get_forum_discussions',
  'mod_forum_get_discussion_posts',
  'gradereport_user_get_grade_items',
];

export type Session = { base: string; token: string; userid: number };

/** Moodle REST wants nested params as `a[0][b]=x`. */
export function flatten(value: unknown, prefix = '', out = new URLSearchParams()): URLSearchParams {
  if (value === null || value === undefined) return out;
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.append(prefix, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  iexcl: '¡',
  iquest: '¿',
  laquo: '«',
  raquo: '»',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  uuml: 'ü',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
  Uuml: 'Ü',
};

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] !== '#'
        ? (ENTITIES[e] ?? m)
        : String.fromCodePoint(
            e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
          )
    )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

/** Unix seconds → "YYYY-MM-DD HH:MM" in Buenos Aires time. */
export function date(t: number | null | undefined): string | undefined {
  if (!t) return undefined;
  return new Date(t * 1000)
    .toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
    .slice(0, 16);
}

export async function ws<T = any>(s: Session, fn: string, params: object = {}): Promise<T> {
  const body = flatten(params);
  body.set('wstoken', s.token);
  body.set('wsfunction', fn);
  const res = await fetch(`${s.base}/webservice/rest/server.php?moodlewsrestformat=json`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const data: any = await res.json().catch(() => {
    throw new Error(`${fn}: respuesta inválida del campus (HTTP ${res.status})`);
  });
  if (data?.exception) {
    if (data.errorcode === 'invalidtoken')
      throw new Error(`La sesión del campus expiró: ${RELOGIN}.`);
    throw new Error(`${fn}: ${data.message}`);
  }
  return data;
}

export async function loadSession(): Promise<Session> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    throw new Error(`No hay sesión del campus: ${RELOGIN}.`);
  }
}

export async function login(base: string, username: string, password: string) {
  const res = await fetch(`${base}/login/token.php`, {
    method: 'POST',
    body: new URLSearchParams({ username, password, service: 'moodle_mobile_app' }),
    signal: AbortSignal.timeout(30_000),
  });
  const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!data.token) throw new Error(data.error || 'Login fallido');

  const info = await ws({ base, token: data.token, userid: 0 }, 'core_webservice_get_site_info');
  const session: Session = { base, token: data.token, userid: info.userid };
  await mkdir(DIR, { recursive: true, mode: 0o700 });
  await writeFile(FILE, JSON.stringify(session), { mode: 0o600 });
  await chmod(FILE, 0o600); // mode above is ignored when the file already exists

  const enabled = new Set((info.functions ?? []).map((f: { name: string }) => f.name));
  return {
    fullname: info.fullname as string,
    file: FILE,
    missing: NEEDED.filter(f => !enabled.has(f)),
  };
}

/** Downloads a campus file. Only the session's own origin: the token rides in the URL. */
export async function fetchFile(s: Session, url: string) {
  const u = new URL(url);
  if (u.origin !== new URL(s.base).origin)
    throw new Error(`Solo se pueden leer archivos de ${s.base}`);
  u.pathname = u.pathname.replace(/^\/pluginfile\.php/, '/webservice/pluginfile.php');
  u.searchParams.set('token', s.token);

  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`No se pudo descargar el archivo (HTTP ${res.status})`);
  if (Number(res.headers.get('content-length')) > MAX_FILE)
    throw new Error('Archivo demasiado grande (>25 MB)');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_FILE) throw new Error('Archivo demasiado grande (>25 MB)');

  const type = res.headers.get('content-type') ?? '';
  if (type.includes('json')) {
    // webservice/pluginfile.php reports errors as a JSON body
    let err: any;
    try {
      err = JSON.parse(new TextDecoder().decode(buf));
    } catch {}
    if (err?.errorcode)
      throw new Error(
        err.errorcode === 'invalidtoken'
          ? `La sesión expiró: ${RELOGIN}.`
          : (err.error ?? err.message)
      );
  }
  return { buf, type, path: u.pathname };
}
