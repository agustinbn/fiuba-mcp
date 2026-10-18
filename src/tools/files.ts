import { extractText, getDocumentProxy } from 'unpdf';
import * as z from 'zod/v4';
import { fetchFile } from '../moodle/files.ts';
import { stripHtml } from '../moodle/format.ts';
import { defineTool } from './define.ts';

const CHUNK = 20_000;

export const readFile = defineTool(
  'fiuba_read_file',
  'Reads a file from the campus (PDF, plain text, HTML, CSV, code) as text, 20k characters at a time. Pass the `url` from fiuba_get_course; use `offset` to continue.',
  { url: z.string(), offset: z.number().int().min(0).default(0) },
  async (s, { url, offset }) => {
    // ponytail: re-downloads the file for every chunk; cache by url if long PDFs get slow
    const { buf, type, path } = await fetchFile(s, url);
    let text: string;
    if (type.includes('pdf') || path.toLowerCase().endsWith('.pdf')) {
      text = (
        await extractText(await getDocumentProxy(buf, { verbosity: 0 }), { mergePages: true })
      ).text.trim();
      if (!text) return 'El PDF no tiene capa de texto (¿escaneado?). No se puede leer todavía.';
    } else if (/^text\/|json|xml|csv|javascript/.test(type)) {
      text = new TextDecoder().decode(buf);
      if (type.includes('html')) text = stripHtml(text);
    } else {
      return `Formato no soportado todavía (${type || 'desconocido'}). Abrilo desde el campus: ${url}`;
    }
    const next = offset + CHUNK;
    return (
      text.slice(offset, next) +
      (next < text.length ? `\n\n[continúa: offset=${next} de ${text.length} caracteres]` : '')
    );
  }
);
