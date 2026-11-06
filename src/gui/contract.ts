import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

export const SessionSummarySchema = Schema.Struct({
  id: Schema.String,
  source: Schema.String,
  title: Schema.String,
  directory: Schema.String,
  project: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  status: Schema.String,
  size: Schema.Number,
  path: Schema.String,
})

/**
 * Typed bridge between the Electron main process (filesystem + OpenCode client)
 * and every window (the panel). No model call crosses this bridge.
 *
 * The id is `flex-session-bridge.sessions`: a token must start with the plugin
 * id, which is the package name, not the repo name.
 */
export const SessionsIpc = Ipc.define({
  id: "flex-session-bridge.sessions",
  methods: {
    list: { output: Schema.Array(SessionSummarySchema) },
    join: {
      input: Schema.Struct({ id: Schema.String, mode: Schema.String }),
      output: Schema.String,
    },
  },
  events: {
    changed: Schema.Boolean,
  },
})
