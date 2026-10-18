import assert from 'node:assert/strict';
import { test } from 'node:test';
import { date, stripHtml } from '../moodle/format.ts';
import { flatten } from '../moodle/ws.ts';

test('flatten nests arrays and objects the way Moodle REST expects', () => {
  const p = flatten({ courseids: [3, 7], options: [{ name: 'x', value: true }], skip: undefined });
  assert.equal(
    p.toString(),
    'courseids%5B0%5D=3&courseids%5B1%5D=7&options%5B0%5D%5Bname%5D=x&options%5B0%5D%5Bvalue%5D=1'
  );
});

test('stripHtml drops tags and decodes entities', () => {
  assert.equal(
    stripHtml(
      '<p>Entrega&nbsp;del <b>TP&nbsp;1</b></p><p>Mi&eacute;rcoles &amp; jueves &#191;ok&#x3F;</p>'
    ),
    'Entrega del TP 1\nMiércoles & jueves ¿ok?'
  );
  assert.equal(stripHtml(null), '');
});

test('date renders Buenos Aires local time', () => {
  assert.equal(date(1767236340), '2025-12-31 23:59'); // 2026-01-01 02:59 UTC
  assert.equal(date(0), undefined);
});
