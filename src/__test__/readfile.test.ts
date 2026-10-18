import { CONFIG_HOME } from './env.ts';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { saveSession } from '../moodle/session.ts';
import { readFile } from '../tools/files.ts';
import { callText, register, SESSION, stubFetch } from './helpers.ts';

const URL_ = 'https://campus.test/pluginfile.php/5/mod_resource/content/1/';

beforeEach(() => saveSession(SESSION));
afterEach(async () => {
  mock.restoreAll();
  await rm(join(CONFIG_HOME, 'fiuba-mcp'), { recursive: true, force: true });
});

const serve = (body: BodyInit, type?: string) =>
  stubFetch(() => new Response(body, type ? { headers: { 'content-type': type } } : {}));

/** A minimal one-page PDF; an empty `text` gives a page without any text layer. */
function pdf(text: string) {
  const stream = text ? `BT /F1 12 Tf 20 100 Td (${text}) Tj ET` : '';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

test('fiuba_read_file has url and offset (default 0, non-negative integer) as input', () => {
  const { inputSchema } = register(readFile).config;
  assert.equal(inputSchema.parse({ url: 'u' }).offset, 0);
  assert.ok(!inputSchema.safeParse({ url: 'u', offset: -1 }).success);
  assert.ok(!inputSchema.safeParse({ url: 'u', offset: 1.5 }).success);
  assert.ok(!inputSchema.safeParse({ offset: 0 }).success);
});

test('reads the text layer of a PDF identified by content-type', async () => {
  serve(pdf('Hola mundo'), 'application/pdf');
  assert.equal(await callText(readFile, { url: `${URL_}a.pdf`, offset: 0 }), 'Hola mundo');
});

test('identifies a PDF by extension (any case) when the content-type is generic', async () => {
  serve(pdf('Desde extension'), 'application/octet-stream');
  assert.equal(await callText(readFile, { url: `${URL_}A.PDF`, offset: 0 }), 'Desde extension');
});

test('a PDF without a text layer says so instead of returning nothing', async () => {
  serve(pdf(''), 'application/pdf');
  assert.match(
    await callText(readFile, { url: `${URL_}scan.pdf`, offset: 0 }),
    /no tiene capa de texto/
  );
});

test('reads plain text, CSV, JSON, XML and JavaScript as text', async () => {
  for (const type of [
    'text/plain',
    'text/csv',
    'application/json',
    'application/xml',
    'application/javascript',
  ]) {
    serve('contenido', type);
    assert.equal(await callText(readFile, { url: `${URL_}f`, offset: 0 }), 'contenido', type);
  }
});

test('decodes UTF-8 text', async () => {
  serve('Año ñandú ✓', 'text/plain; charset=utf-8');
  assert.equal(await callText(readFile, { url: `${URL_}f`, offset: 0 }), 'Año ñandú ✓');
});

test('strips HTML tags from HTML files', async () => {
  serve('<html><body><h1>Título</h1><p>Cuerpo&nbsp;uno</p></body></html>', 'text/html');
  assert.equal(await callText(readFile, { url: `${URL_}f.html`, offset: 0 }), 'Título\nCuerpo uno');
});

test('returns a link for unsupported formats, with "desconocido" when the type is missing', async () => {
  serve(new Uint8Array([1, 2]), 'image/png');
  assert.equal(
    await callText(readFile, { url: `${URL_}f.png`, offset: 0 }),
    `Formato no soportado todavía (image/png). Abrilo desde el campus: ${URL_}f.png`
  );
  serve(new Uint8Array([1, 2]));
  assert.match(await callText(readFile, { url: `${URL_}f`, offset: 0 }), /\(desconocido\)/);
});

test('long files come in 20k-character chunks with a continuation marker', async () => {
  const text = 'a'.repeat(20_000) + 'b'.repeat(5_000);
  serve(text, 'text/plain');
  assert.equal(
    await callText(readFile, { url: `${URL_}f`, offset: 0 }),
    'a'.repeat(20_000) + '\n\n[continúa: offset=20000 de 25000 caracteres]'
  );
  assert.equal(await callText(readFile, { url: `${URL_}f`, offset: 20_000 }), 'b'.repeat(5_000));
});

test('a file of exactly one chunk has no continuation marker', async () => {
  serve('a'.repeat(20_000), 'text/plain');
  assert.equal(await callText(readFile, { url: `${URL_}f`, offset: 0 }), 'a'.repeat(20_000));
});

test('an offset past the end returns an empty string', async () => {
  serve('corto', 'text/plain');
  assert.equal(await callText(readFile, { url: `${URL_}f`, offset: 999 }), '');
});

test('refuses URLs outside the campus without fetching', async () => {
  const f = serve('x', 'text/plain');
  await assert.rejects(
    callText(readFile, { url: 'https://evil.test/pluginfile.php/f', offset: 0 }),
    /Solo se pueden leer archivos de https:\/\/campus.test/
  );
  assert.equal(f.mock.callCount(), 0);
});

test('propagates download errors', async () => {
  stubFetch(() => new Response('', { status: 403 }));
  await assert.rejects(callText(readFile, { url: `${URL_}f`, offset: 0 }), /HTTP 403/);
});
