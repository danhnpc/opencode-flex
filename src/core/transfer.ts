import type { Transcript } from "./types"

/**
 * A deliberately narrow view of the OpenCode client. Using a structural type
 * here keeps the bundle free of `@opencode/client` imports (the GUI Vite preset
 * rejects app-owned modules that the host does not provide).
 */
export interface ModelRefLike {
  id: string
  providerID: string
}

export interface TransferClient {
  location: {
    get(input: { location: { directory: string } }): Promise<{ project: { id: string } }>
  }
  agent: {
    list(input: { location: { directory: string } }): Promise<{
      data: Array<{ id: string; mode: string; model?: ModelRefLike }>
    }>
  }
  model: {
    default(input: { location: { directory: string } }): Promise<{
      data: { modelID: string; providerID: string } | null
    }>
  }
}

export interface TransferPayload {
  info: Record<string, unknown>
  messages: Array<Record<string, unknown>>
  location: { directory: string }
}

const ZERO_TOKENS = {
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
}

/**
 * Pure JSON -> JSON transform. No model call, no summarisation, no network
 * request to an inference provider. This is the whole "join" operation.
 *
 * - `info.location.directory` is the original session's cwd, so OpenCode works
 *   on the same codebase.
 * - `info.model` / `info.agent` are left out, so OpenCode's own defaults apply
 *   and OpenCode's model produces every subsequent answer.
 * - tool calls are folded into text parts instead of being reconstructed as
 *   OpenCode tool parts (the two formats are not equivalent).
 */
export async function buildTransfer(
  client: TransferClient,
  transcript: Transcript,
  opts: { title: string; source: string; agent: string },
): Promise<TransferPayload> {
  const directory = transcript.directory
  const where = { directory }

  const [loc, agents, model] = await Promise.all([
    client.location.get({ location: where }),
    client.agent.list({ location: where }),
    client.model.default({ location: where }),
  ])

  const agent =
    opts.agent ||
    agents.data.find((a) => a.mode === "primary")?.id ||
    agents.data[0]?.id ||
    "build"

  const agentModel = agents.data.find((a) => a.model)?.model
  const modelRef: ModelRefLike = model.data
    ? { id: model.data.modelID, providerID: model.data.providerID }
    : (agentModel ?? { id: "unknown", providerID: "unknown" })

  const stem = transcript.sessionId.replace(/[^a-zA-Z0-9]/g, "")

  const messages = transcript.turns.map((turn, index) => {
    const id = `msg_flex_${stem}_${index}`
    if (turn.role === "user") {
      return {
        id,
        type: "user",
        time: { created: turn.timestamp },
        text: turn.text,
      }
    }
    return {
      id,
      type: "assistant",
      time: { created: turn.timestamp, completed: turn.timestamp },
      agent,
      model: modelRef,
      content: [{ type: "text", text: turn.text }],
      finish: "stop",
    }
  })

  return {
    info: {
      // Set by the caller to a deterministic id so re-joining is idempotent.
      id: "",
      projectID: loc.project.id,
      agent: opts.agent,
      cost: 0,
      tokens: ZERO_TOKENS,
      time: { created: transcript.createdAt, updated: transcript.updatedAt },
      title: opts.title,
      location: { directory },
      metadata: {
        flexSource: opts.source,
        flexSourceId: transcript.sessionId,
      },
    },
    messages,
    location: { directory },
  }
}
