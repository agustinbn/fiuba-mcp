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

## Agents

Project agents live in `.claude/agents/`. None of them may run `login`, call the MCP tools against the real campus, or read `~/.config/fiuba-mcp/` (it holds a live Moodle token).

- `researcher` — read-only "find out X" questions: what a Moodle web-service function takes/returns or whether it exists, where something happens in the repo, why/when code changed. Fire it off (in parallel if needed) instead of looking things up mid-task. Reports findings with citations and never recommends what to build.
- `advisor` — design and security decisions, never routine work. Consult at: kickoff of a new tool or non-trivial feature; any change touching a trust boundary (session storage, login/token handling, `fetchFile` guards, `ws()` serialization) or that could make a tool write to Moodle; a build/test failure still unfixed after 2 attempts; pre-commit on such changes; real campus behavior that contradicts what the code assumes. Pass a brief with file paths, not pasted contents.
- `coder` — implements one well-defined work item (brief + acceptance criteria), runs `npm run build`, `npm test`, `npm run format:check`, and makes one Conventional Commit without pushing. Use it to keep file reads and test output out of the main session. Dispatch items sequentially, never in parallel in the same checkout. Not for planning or review.
- `critic` — adversarial review of any diff, used liberally: after writing code and before calling a task done. Returns severity-ranked defects; never edits. Security findings (secret exposure, write path, guard bypass) should be escalated to `advisor`.

Typical flow for a new tool: `researcher` (wsfunction details) → `advisor` (approach, if it touches a trust boundary or is non-trivial) → `coder` → `critic` → commit/push.
