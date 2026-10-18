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

test('flatten serializes booleans as 1/0, skips null/undefined and empty containers', () => {
  const p = flatten({ yes: true, no: false, n: null, u: undefined, none: [], zero: 0, s: '' });
  assert.deepEqual(
    [...p],
    [
      ['yes', '1'],
      ['no', '0'],
      ['zero', '0'],
      ['s', ''],
    ]
  );
});

test('flatten handles deep nesting and nulls inside arrays', () => {
  const p = flatten({ a: { b: { c: 'x' } }, l: [null, 'y'] });
  assert.deepEqual(
    [...p],
    [
      ['a[b][c]', 'x'],
      ['l[1]', 'y'],
    ]
  );
});

test('flatten of null/undefined returns an empty set and appends to a given one', () => {
  assert.equal(flatten(null).size, 0);
  assert.equal(flatten(undefined).size, 0);
  const into = new URLSearchParams('a=1');
  assert.equal(flatten({ b: 2 }, '', into), into);
  assert.equal(into.toString(), 'a=1&b=2');
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

test('stripHtml returns empty for null, undefined and empty input', () => {
  assert.equal(stripHtml(undefined), '');
  assert.equal(stripHtml(null), '');
  assert.equal(stripHtml(''), '');
});

test('stripHtml removes script and style blocks with their content, any case', () => {
  assert.equal(stripHtml('a<script>alert(1)</script>b<STYLE>p{}</STYLE>c'), 'abc');
});

test('stripHtml turns block and line-break tags into single newlines', () => {
  assert.equal(stripHtml('a<br>b<br/>c</div>d</li>e</tr>f</h2>g'), 'a\nb\nc\nd\ne\nf\ng');
  assert.equal(stripHtml('<p>a</p>\n\n<p>b</p>'), 'a\nb');
});

test('stripHtml collapses spaces/tabs and trims', () => {
  assert.equal(stripHtml('  a \t\t b   \n   c  '), 'a b\nc');
});

test('stripHtml decodes named, decimal and hex (any case) entities and keeps unknown ones', () => {
  assert.equal(
    stripHtml('&lt;b&gt; &quot;x&quot; &apos;y&apos; &ntilde;&Ntilde; &uuml;&Uuml;'),
    '<b> "x" \'y\' ñÑ üÜ'
  );
  assert.equal(stripHtml('&#65;&#x42;&#X43;'), 'ABC');
  assert.equal(stripHtml('&foo; &amp'), '&foo; &amp');
});

test('stripHtml does not double-decode (&amp;lt; stays &lt;)', () => {
  assert.equal(stripHtml('&amp;lt;'), '&lt;');
});

test('date renders Buenos Aires local time', () => {
  assert.equal(date(1767236340), '2025-12-31 23:59'); // 2026-01-01 02:59 UTC
  assert.equal(date(0), undefined);
});

test('date returns undefined for null/undefined and does not shift with the host timezone', () => {
  assert.equal(date(null), undefined);
  assert.equal(date(undefined), undefined);
  assert.equal(date(1751328000), '2025-06-30 21:00'); // 2025-07-01 00:00 UTC, UTC-3 all year
});
