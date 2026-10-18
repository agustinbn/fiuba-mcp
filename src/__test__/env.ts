import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Import this FIRST in every test file: session.ts reads XDG_CONFIG_HOME when it is loaded, and
// tests must never touch the real ~/.config/fiuba-mcp/ (it holds a live Moodle token).
export const CONFIG_HOME = mkdtempSync(join(tmpdir(), 'fiuba-mcp-test-'));
process.env.XDG_CONFIG_HOME = CONFIG_HOME;
