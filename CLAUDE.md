# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Unofficial, read-only MCP server (stdio) for the FIUBA Moodle campus. User-facing docs are in Spanish in `README.md`; tool descriptions and code comments are in English, runtime error messages in Spanish.

## Commands

```sh
npm run build         # tsc -> build/ (also runs on `npm install` via `prepare`)
npm test              # node --test src/__test__/*.test.ts (Node 22+ runs .ts directly)
node --test --test-name-pattern="flatten" src/__test__/moodle.test.ts   # single test
npm run format        # prettier --write . (format:check to verify)
node build/index.js login                     # store a Moodle token (needs a TTY)
npx @modelcontextprotocol/inspector node build/index.js
```

There is no linter. `build/` is gitignored and must be rebuilt after source changes before running the server.

## Architecture

ESM (`"type": "module"`, NodeNext), layered so that `tools/` → `moodle/` and nothing points back:

- `src/index.ts` — entry point: `argv[2] === 'login'` runs `cli/login.ts` (interactive login), otherwise `server.ts` starts the MCP stdio server.
- `src/moodle/` — Moodle web-service layer, no MCP knowledge: `session.ts` (persistence in `~/.config/fiuba-mcp/session.json`, 0600), `login.ts` (exchanges credentials for a `moodle_mobile_app` token via `/login/token.php`; the password is never stored), `ws.ts` (`ws()` POSTs to `/webservice/rest/server.php`; nested params serialized by `flatten` as `a[0][b]=x`), `files.ts` (`fetchFile`), `format.ts` (pure helpers: `stripHtml`, `date` in Buenos Aires time).
- `src/tools/` — one file per domain (`courses`, `files`, `calendar`, `assignments`, `forums`, `grades`), each exporting tools built with `defineTool()` (`define.ts`: marks them `readOnlyHint`, loads the session on every call, JSON-stringifies the result). `tools/index.ts` lists them all; `server.ts` registers that list.

Cross-cutting notes:

- `NEEDED` in `moodle/login.ts` lists the Moodle web-service functions the tools call. Adding a tool means exporting it from its `tools/*.ts` file and listing it in `tools/index.ts`; if it uses a new `wsfunction`, add that to `NEEDED` too so `login` can warn when the campus has it disabled.
- Relative imports use `.ts` extensions in source (`rewriteRelativeImportExtensions` turns them into `.js` in `build/`), so tests can import modules directly under Node's type stripping; `src/__test__` is excluded from the `tsc` build.
- `fetchFile` (`moodle/files.ts`) only downloads from the session's own origin (the token is appended to the URL), rewrites `/pluginfile.php` to `/webservice/pluginfile.php`, caps files at 25 MB, and detects Moodle's JSON-body errors. Keep those guards when touching it.
- Forum post content is user-authored; `UNTRUSTED` in `tools/forums.ts` is the prompt-injection warning attached to discussion tool descriptions.
- `FIUBA_CAMPUS_URL` selects the campus (default grado; posgrado is `campusposgrado.fi.uba.ar`).
