import { CONFIG_HOME } from './env.ts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { tools } from '../tools/index.ts';

const ENTRY = new URL('../index.ts', import.meta.url).pathname;
const env = { ...process.env, XDG_CONFIG_HOME: CONFIG_HOME };

/** Runs the real entry point over stdio, sending one JSON-RPC message per line. */
function rpc(messages: object[], expectedReplies: number) {
  const child = spawn(process.execPath, [ENTRY], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  return new Promise<any[]>((resolve, reject) => {
    const replies: any[] = [];
    let buffer = '';
    let done = false;
    child.stdout.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines.filter(Boolean)) replies.push(JSON.parse(line));
      if (replies.length >= expectedReplies) {
        done = true;
        child.stdin.end(); // clean exit so the child's coverage is written
      }
    });
    child.on('error', reject);
    child.on('close', () =>
      done ? resolve(replies) : reject(new Error(`server exited early: ${JSON.stringify(replies)}`))
    );
    for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
  });
}

const init = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 't', version: '0' },
    },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
];

test('the stdio server lists every tool as read-only', async () => {
  const [hello, list] = await rpc([...init, { jsonrpc: '2.0', id: 2, method: 'tools/list' }], 2);
  assert.equal(hello.result.serverInfo.name, 'fiuba-mcp');
  assert.equal(list.result.tools.length, tools.length);
  for (const t of list.result.tools) {
    assert.match(t.name, /^fiuba_/);
    assert.equal(t.annotations.readOnlyHint, true, t.name);
  }
});

test('calling a tool without a stored session returns an error result, not a crash', async () => {
  const [, call] = await rpc(
    [
      ...init,
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'fiuba_list_courses', arguments: {} },
      },
    ],
    2
  );
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /No hay sesión del campus/);
});

test('`login` without a terminal exits 1 with a Spanish error', async () => {
  const child = spawn(process.execPath, [ENTRY, 'login'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', c => (stderr += c));
  child.stdin.end();
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.equal(code, 1);
  assert.equal(stderr.trim(), 'Error: `login` necesita una terminal interactiva.');
});
