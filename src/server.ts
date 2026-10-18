import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { tools } from './tools/index.ts';

export async function startServer() {
  const server = new McpServer({ name: 'fiuba-mcp', version: '0.1.0' });
  for (const register of tools) register(server);
  await server.connect(new StdioServerTransport());
}
