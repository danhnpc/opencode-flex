import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { usePlugin, type Plugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { SessionsIpc } from "./contract"
import type { SessionSummary } from "../core/types"

const shell: Record<string, string> = {
  display: "flex",
  "flex-direction": "column",
  height: "100%",
  "min-height": "0",
  "font-size": "12px",
  "box-sizing": "border-box",
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function when(ms: number): string {
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return ""
  }
}

export function SessionsView() {
  const ctx = usePlugin<typeof definition>()
  const ipc = ctx.main(SessionsIpc)

  const [items, setItems] = createSignal<SessionSummary[]>([])
  const [query, setQuery] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal("")
  const [joining, setJoining] = createSignal<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      // Effect Schema.Array decodes to a readonly array; Solid wants a mutable one.
      setItems([...(await ipc.list({ signal: ctx.signal }))])
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void refresh())
  onCleanup(ipc.on("changed", () => void refresh()))

  const visible = createMemo(() => {
    const q = query().trim().toLowerCase()
    const sorted = [...items()].sort((a, b) => b.updatedAt - a.updatedAt)
    const matches = q
      ? sorted.filter((s) =>
          `${s.title} ${s.directory} ${s.project} ${s.source}`
            .toLowerCase()
            .includes(q),
        )
      : sorted
    return matches.slice(0, 300)
  })

  const join = async (session: SessionSummary) => {
    if (joining()) return
    setJoining(session.id)
    setError("")
    try {
      const id = await ipc.join(session.id, { signal: ctx.signal })
      // The desktop app's own server is "sidecar".
      ctx.tabs.open({ server: "sidecar", id }, { focus: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setJoining(null)
    }
  }

  return (
    <div style={shell}>
      <div style={{ display: "flex", gap: "6px", padding: "8px" }}>
        <input
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
          placeholder={ctx.t("search.placeholder")}
          style={{
            flex: "1",
            "min-width": "0",
            padding: "6px 8px",
            "font-size": "12px",
            border: "1px solid rgba(127,127,127,.35)",
            "border-radius": "6px",
            background: "transparent",
            color: "inherit",
          }}
        />
        <button
          onClick={() => void refresh()}
          style={{
            padding: "6px 10px",
            "font-size": "12px",
            border: "1px solid rgba(127,127,127,.35)",
            "border-radius": "6px",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          {ctx.t("refresh")}
        </button>
      </div>

      <Show when={error()}>
        <div style={{ padding: "4px 10px", color: "#f87171", "word-break": "break-word" }}>
          {error()}
        </div>
      </Show>
      <Show when={loading()}>
        <div style={{ padding: "4px 10px", opacity: "0.6" }}>{ctx.t("loading")}</div>
      </Show>
      <div style={{ padding: "2px 10px 6px", opacity: "0.55", "font-size": "11px" }}>
        {ctx.t("count", { count: items().length })}
      </div>

      <div style={{ flex: "1", "min-height": "0", overflow: "auto" }}>
        <Show when={!loading() && visible().length === 0}>
          <div style={{ padding: "10px", opacity: "0.6" }}>{ctx.t("empty")}</div>
        </Show>
        <For each={visible()}>
          {(session) => (
            <button
              type="button"
              disabled={joining() !== null}
              onClick={() => void join(session)}
              title={`${session.directory}\n${session.path}`}
              style={{
                display: "block",
                width: "100%",
                "text-align": "left",
                padding: "8px 10px",
                "box-sizing": "border-box",
                border: "none",
                "border-bottom": "1px solid rgba(127,127,127,.15)",
                background: "transparent",
                color: "inherit",
                cursor: joining() ? "progress" : "pointer",
                opacity: joining() && joining() !== session.id ? "0.45" : "1",
              }}
            >
              <div style={{ "font-weight": "600", "word-break": "break-word" }}>
                {session.title}
              </div>
              <div
                style={{
                  "font-size": "11px",
                  opacity: "0.65",
                  "white-space": "nowrap",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                  "margin-top": "2px",
                }}
              >
                {session.directory}
              </div>
              <div style={{ "font-size": "10px", opacity: "0.5", "margin-top": "3px" }}>
                {when(session.updatedAt)} · {session.source} · {session.status} ·{" "}
                {size(session.size)}
                {joining() === session.id ? ` · ${ctx.t("joining")}` : ""}
              </div>
            </button>
          )}
        </For>
      </div>

      <div
        style={{
          padding: "8px 10px",
          "font-size": "10px",
          "line-height": "1.4",
          opacity: "0.55",
          "border-top": "1px solid rgba(127,127,127,.15)",
        }}
      >
        {ctx.t("hint")}
      </div>
    </div>
  )
}
