import { RELOGIN, type Session } from './session.ts';

const MAX_FILE = 25 * 1024 * 1024;

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
