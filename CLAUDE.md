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

Two source files, ESM (`"type": "module"`, NodeNext):

- `src/moodle.ts` — Moodle web-service layer: session persistence (`~/.config/fiuba-mcp/session.json`, 0600), `login` (exchanges credentials for a `moodle_mobile_app` token via `/login/token.php`; the password is never stored), `ws()` (POST to `/webservice/rest/server.php`, nested params serialized by `flatten` as `a[0][b]=x`), `fetchFile`, and pure helpers (`stripHtml`, `date` in Buenos Aires time).
- `src/index.ts` — the entry point does double duty: `argv[2] === 'login'` runs the interactive login CLI, otherwise it starts the MCP stdio server. All eight `fiuba_*` tools are declared through the local `tool()` helper, which wraps `registerTool`, marks them `readOnlyHint`, loads the session on every call, and JSON-stringifies the result.

Things that span both files:

- `NEEDED` in `moodle.ts` lists the Moodle web-service functions the tools call. Adding a tool that uses a new `wsfunction` means adding it there so `login` can warn when the campus has it disabled.
- Imports use `.js` extensions (`./moodle.js`) in source, but tests import `../moodle.ts` directly; `src/__test__` is excluded from the `tsc` build.
- `fetchFile` only downloads from the session's own origin (the token is appended to the URL), rewrites `/pluginfile.php` to `/webservice/pluginfile.php`, caps files at 25 MB, and detects Moodle's JSON-body errors. Keep those guards when touching it.
- Forum post content is user-authored; `UNTRUSTED` in `index.ts` is the prompt-injection warning attached to discussion tool descriptions.
- `FIUBA_CAMPUS_URL` selects the campus (default grado; posgrado is `campusposgrado.fi.uba.ar`).
