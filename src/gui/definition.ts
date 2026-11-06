import { Plugin } from "@opencode/plugin/gui"

export const definition = Plugin.define({
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
    },
  },
})
