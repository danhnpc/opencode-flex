# opencode-flex

> Unofficial community plugin for **OpenCode Desktop** — surface local AI coding
> sessions in a side panel, then let **OpenCode's own model** continue them.

`opencode-flex` adds a pinned side panel to OpenCode Desktop listing the coding
sessions already stored on your machine. Clicking one **joins** it: the full
transcript is imported as a real OpenCode session at the same working directory,
and from that point on every reply comes from the model/provider you configured
in OpenCode — not from the tool that originally created the session. You keep
the whole history and the same codebase, and you work inside OpenCode.

The first supported source is Claude Code (`~/.claude/...`). The source layer is
pluggable: adding another agent later means adding one adapter, not renaming the
repo or rewriting the UI — hence the deliberately general name.

> **Status:** early / experimental. Built against OpenCode Desktop **2.2.5**.
> The GUI plugin SDK (`./gui-experimental`) and the session import endpoint are
> both marked experimental upstream and may change between releases.

### Verified on 2.2.5 (Windows)

- `/api/plugin` reports `flex-session-bridge` as `{"features":{"gui":true},"state":{"status":"active"}}` — a GUI-only plugin loads without a server part.
- `/api/plugin/gui?id=flex-session-bridge` serves the prebuilt CJS bundle.
- `location.get`, `agent.list` and `model.default` return the shapes used to build the import payload. The default model here is the OpenCode model, not Claude Code.
- `POST /api/experimental/session/import` returned `200`, the session was readable via `session.get` (`200`), then removed (`204`). No model call was made.
- Listing 762 root sessions from ~1.3 GB of transcripts took ~0.3–0.6 s; reading one 500 KB transcript took ~4 ms.
- All three working modes were exercised end-to-end against a temporary session: `plan` → agent `plan`, `manual` → two `ask` rules, `auto` → cleared rules. Session was removed afterwards.
- Verified visually on the running desktop: the `Flex Sessions` panel lists sessions, and the `Auto` pill sits in the composer toolbar immediately next to the `Default` effort picker.

---

## The zero-token rule

This plugin exists because linking sessions should not cost model tokens.

| Moment | What happens | Model tokens |
| --- | --- | --- |
| App starts | `stat` the transcript files, read a handful of small JSON index files, render the panel | **0** |
| You click **Join** | Read exactly one transcript, map it deterministically to OpenCode's message schema, `POST` an import | **0** — import only writes history, it does not generate a reply |
| You type the next prompt | The OpenCode model answers, with the imported history as context | Normal work cost — exactly what you wanted |

There is **no** LLM call to summarise, merge, deduplicate or "link" sessions,
no agent invocation, and no network call at startup. The join is a pure
JSON→JSON transform plus one local HTTP call to OpenCode's own server.

---

## Working modes (composer pill)

A pill above the composer mirrors Claude Code's mode switcher. Click it to pick
a mode, or press **Shift+Tab** to cycle `plan → manual → auto`.

| Mode | OpenCode agent | Session permissions | Claude Code equivalent |
| --- | --- | --- | --- |
| **Plan** | `plan` | `[]` — the plan agent itself denies edits (except `~/.opencode/plan`) | `plan` |
| **Manual** | `build` | `edit:* → ask`, `shell:* → ask` | `default` |
| **Auto** | `build` | `[]` — no override, native allow-all | `auto` / `bypassPermissions` |

OpenCode's built-in base policy is already allow-all (only `.env` reads ask), so
the pill starts at **Auto** — the honest label for a session we have not touched.
**Manual** is the mode that actively adds `ask` rules, which is the reverse of
Claude Code's direction. Organization `policies` still hard-deny; Auto cannot
bypass them.

The mode is stored per session. Joining a session from the panel creates the new
OpenCode session in the mode currently shown by the pill, and re-joining with a
different mode updates that same session instead of creating a duplicate.
Changing modes never calls a model.

## Where the mode pill sits

The official `ComposerPill` registry renders pills in the row **above** the
composer. The mode belongs next to the model / effort pickers, so the plugin
moves the pill strip into the composer's control row
(`form[data-component="composer"] [data-slot="composer-controls"]`) with a small
`MutationObserver`, and tunes spacing with the `Style` registry.

This is the one part that relies on the app's internal `data-slot` attributes
(verified on Desktop 2.2.5). It degrades gracefully: if a future release changes
those selectors, the pill simply stays in its original row above the composer —
mode switching, Shift+Tab and Join all keep working. No `app.asar` patch, no DOM
cloning, no model call.

## How it works

```
Electron main process (node:fs + fs.watch)
  ├─ list()   stat ~/.claude/projects/**/*.jsonl + read ~/.claude/sessions/*.json
  ├─ read()   lazy: parse one .jsonl transcript on demand
  └─ map()    deterministic JSONL -> SessionTransfer.Data
        │  Ipc (local, typed) — no server code, no model
        ▼
Window (Solid)
  ├─ Panel(region: "side", pinned, auto-open) → searchable, grouped list
  ├─ click Join → POST /api/experimental/session/import via ctx.client
  └─ ctx.tabs.open({ server: "sidecar", id }) → focus the new session
```

- `info.location` is set to the original session's `cwd`, so OpenCode works on
  the **same code**.
- `info.model` / `info.agent` are left at the **OpenCode defaults**, so OpenCode's
  model answers.
- `type: "user"` → `Session.Message.User`; `type: "assistant"` →
  `Session.Message.Assistant` with text parts. Tool calls are folded into text
  rather than reconstructed as OpenCode tool parts, which keeps the timeline
  faithful without pretending the two tool formats are identical.
- Non-conversation records (`queue-operation`, `attachment`, `api-request*`,
  `file-history-snapshot`, …) are skipped.

The import is **one-way**: Claude Code → OpenCode. The new session has a new id,
nothing is written back into `~/.claude/`, and Claude Code does not see what you
do afterwards. Two-way sync would no longer be a frontend-only plugin.

---

## Install

Requirements: OpenCode Desktop **2.2.5+**, Node 20+.

```sh
git clone https://github.com/danhnpc/opencode-flex.git
cd opencode-flex
npm install
npm run build
```

Then add the directory to your **global** config
`~/.config/opencode/opencode.jsonc` (the desktop app reads plugins from this
file, not from `cli.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["D:/Opencode/opencode-flex"]
}
```

On macOS/Linux an absolute path or `file:///...` URL works too. OpenCode watches
config files, so no restart is needed. Confirm in
**Settings → Extensions → Plugins**; the switch there toggles the panel.

`dist/gui-experimental.cjs` is committed on purpose: OpenCode requires a
prebuilt CommonJS bundle, so a fresh clone works without a build step. After
editing source, run `npm run dev` (watch) and the GUI reloads in every window.

### Repo layout

```
src/
  sources/
    claude/      <- first adapter: reads ~/.claude, maps JSONL
    <other>/     <- future agent adapters implement the same interface
  core/          <- shared list/stat/import logic, schemas, types
  gui/           <- definition, Ipc contract, window setup, main setup, views
  gui.tsx        <- ./gui-experimental entry
```

---

## Compatibility & caveats

| Item | Note |
| --- | --- |
| GUI plugin SDK | `./gui-experimental` is experimental upstream. |
| `POST /api/experimental/session/import` | Experimental. An adapter + fallback (`session.create` + composer context injection) covers the case where it disappears. |
| Plugin id | Package name is `flex-session-bridge`, **not** `opencode*`. OpenCode reserves ids in the `opencode` namespace and will not load those GUIs. |
| Tool calls | Folded into text parts to avoid a lossy format conversion. |
| Large histories | Startup stats transcript files and reads only a bounded 64 KB head of each for its title/cwd. On a machine with 761 root sessions (~1.3 GB of `.jsonl`), the first list took ~0.6 s and cost zero tokens. |
| Nested subagent logs | `projects/<cwd>/<uuid>/subagents/*.jsonl` are parts of a parent session, not standalone sessions, so they are listed as part of the parent rather than duplicated in the panel. |

---

## Privacy

The plugin reads session files **only at runtime, on your machine**. It never
bundles, uploads, logs or commits their contents. `.gitignore` blocks
`*.jsonl`, `.claude/`, `sessions/`, `projects/`, credentials, `.env` and
captured fixtures. A typical machine holds >1 GB of transcripts containing
prompts, source code and possibly secrets — do not add them to git, and do not
paste them into issues.

---

## Roadmap

- More session sources (other coding agents) behind the same adapter interface.
- Per-source filters, search across sources, pin/favourite sessions.
- Optional turn budget when importing very long histories.
- Additional panels/commands beyond session bridging.

---

## License & disclaimer

**MIT** — see [LICENSE](./LICENSE). Copyright © 2026 Danh Nguyen (danhnpc).

Unofficial community plugin; not affiliated with AnomalyCo or Anthropic. See
[NOTICE.md](./NOTICE.md) for third-party notices and trademark notes.
