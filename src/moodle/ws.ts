import { RELOGIN, type Session } from './session.ts';

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
