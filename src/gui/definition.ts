import { Schema } from "effect"
import { Plugin, Store } from "@opencode/plugin/gui"

export const ModeSchema = Schema.Union([
  Schema.Literal("plan"),
  Schema.Literal("manual"),
  Schema.Literal("auto"),
])

export const definition = Plugin.define({
  // One global record keyed by session id, so the pill, the Shift+Tab command
  // and the Join flow all agree on a session's mode.
  stores: {
    modes: Store.global(
      Schema.Struct({ byId: Schema.Record(Schema.String, ModeSchema) }),
      { byId: {} },
    ),
  },
  i18n: {
    en: {
      "panel.title": "Flex Sessions",
      "command.open": "Open Flex Sessions",
      "command.group": "Flex Sessions",
      "search.placeholder": "Search sessions, folders, prompts…",
      "refresh": "Refresh",
      "loading": "Reading local sessions…",
      "empty": "No sessions found.",
      "count": "{count} session(s) on disk",
      "joining": "Joining…",
      "hint": "Join imports the transcript as a real OpenCode session at the same folder. From then on OpenCode's own model answers. Listing and joining use zero model tokens.",
      "source.claude": "claude",
      "mode.title": "Working mode",
      "mode.cycle": "Cycle working mode (Plan / Manual / Auto)",
      "mode.plan.label": "Plan",
      "mode.plan.detail": "Explore and plan, no file edits",
      "mode.manual.label": "Manual",
      "mode.manual.detail": "Ask before edits and shell",
      "mode.auto.label": "Auto",
      "mode.auto.detail": "Allow edits and shell without asking",
      "mode.error": "Could not apply the working mode",
    },
  },
})
