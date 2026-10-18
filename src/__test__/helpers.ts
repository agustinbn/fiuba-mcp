import assert from 'node:assert/strict';
import { mock } from 'node:test';
import type { Tool } from '../tools/define.ts';

export const SESSION = { base: 'https://campus.test', token: 'tok', userid: 7 };

/** Replaces global fetch. The handler gets the parsed URL and the init; never hits the network. */
export function stubFetch(impl: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  return mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit = {}) =>
    impl(new URL(String(input)), init)
  );
}

/** Answers Moodle web-service calls by `wsfunction`; a function value receives the form params. */
export function wsStub(responses: Record<string, unknown | ((p: URLSearchParams) => unknown)>) {
  return stubFetch((_url, init) => {
    const params = init.body as URLSearchParams;
    const fn = params.get('wsfunction')!;
    const r = responses[fn];
    return Response.json(typeof r === 'function' ? r(params) : r);
  });
}

/** The `wsfunction` and params of every stubbed ws call, in order. */
export function wsCalls(stub: ReturnType<typeof stubFetch>) {
  return stub.mock.calls.map(c => {
    const p = (c.arguments[1] as RequestInit).body as URLSearchParams;
    return { fn: p.get('wsfunction')!, params: p };
  });
}

/** Registers a tool on a fake server and returns what the MCP server would hold. */
export function register(tool: Tool) {
  let reg: any;
  tool({
    registerTool: (name: string, config: any, handler: any) => (reg = { name, config, handler }),
  } as any);
  return reg as {
    name: string;
    config: { description: string; inputSchema: any; annotations: any };
    handler: (args: any) => Promise<{ content: { type: string; text: string }[] }>;
  };
}

/** Calls a tool the way the MCP server does and returns the text of its single content item. */
export async function callText(tool: Tool, args: object = {}) {
  const { content } = await register(tool).handler(args);
  assert.equal(content.length, 1);
  assert.equal(content[0].type, 'text');
  return content[0].text;
}

/** Same, parsed as JSON. */
export async function callJson(tool: Tool, args: object = {}) {
  return JSON.parse(await callText(tool, args));
}
