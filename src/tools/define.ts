import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { loadSession, type Session } from '../moodle/session.ts';

/** A tool that is not yet attached to a server; `server.ts` registers them all. */
export type Tool = (server: McpServer) => void;

/** Declares a read-only tool: loads the session on every call and JSON-stringifies the result. */
export function defineTool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  shape: S,
  run: (s: Session, args: z.infer<z.ZodObject<S>>) => Promise<unknown>
): Tool {
  return server =>
    server.registerTool(
      name,
      { description, inputSchema: z.object(shape), annotations: { readOnlyHint: true } },
      async (args: any) => {
        const out = await run(await loadSession(), args);
        return {
          content: [
            { type: 'text' as const, text: typeof out === 'string' ? out : JSON.stringify(out) },
          ],
        };
      }
    );
}
