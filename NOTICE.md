# Third-party notices

`opencode-flex` is an **unofficial community plugin** for OpenCode Desktop. It is
not affiliated with, endorsed by, or sponsored by AnomalyCo or Anthropic.

## OpenCode

- Project: <https://github.com/anomalyco/opencode> — **MIT License**
- npm packages `@opencode/plugin`, `@opencode/client` — **MIT License**

This repository does **not** vendor, bundle, or redistribute OpenCode source
code, binaries (`app.asar`), logos, or other assets. The GUI SDK
(`@opencode/plugin/gui`) is supplied by the OpenCode Desktop application at
runtime; this repository references it for types and as an external module only.
"OpenCode" and its logos are trademarks of their respective holder and are used
here solely to describe compatibility.

The plugin's package name is deliberately `flex-session-bridge` rather than an
`opencode*` id: OpenCode Desktop reserves ids in the `opencode` namespace and
will not load a GUI plugin that uses one.

## Claude Code / Anthropic

- "Claude Code" and "Anthropic" are trademarks of Anthropic, PBC.

This plugin only reads session files that Claude Code has already written to
the user's own local disk (`~/.claude/...`). It does not bundle, transmit, or
redistribute any of that content, and it does not invoke or require the
`claude` CLI in order to continue a session.

## Session data

No AI session transcripts, credentials, or local configuration are included in
this repository. `.gitignore` blocks them. All session reading happens at
runtime on the user's machine.
