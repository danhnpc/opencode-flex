import { open, readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import type {
  SessionSummary,
  SourceAdapter,
  Transcript,
  TranscriptTurn,
} from "../core/types"

type Json = Record<string, unknown>

// Startup only stats files and reads a bounded head of each transcript.
// The full body of a transcript is read lazily, and only for the one session
// the user actually joins.
const HEAD_BYTES = 64 * 1024
const MAX_TURNS = 2000
const MAX_TEXT = 20_000
const LIST_CONCURRENCY = 24

interface Meta {
  stamp: string
  title: string
  directory: string
  project: string
  createdAt: number
  updatedAt: number
  status: string
  size: number
  sessionId: string
}

function parse(line: string): Json | undefined {
  try {
    const value = JSON.parse(line)
    return value && typeof value === "object" ? (value as Json) : undefined
  } catch {
    return undefined
  }
}

/** Returns undefined for records with no timestamp, so a missing timestamp
 * never silently becomes "now" and rewrites a session's updated time. */
function timeOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const ms = Date.parse(value)
    if (!Number.isNaN(ms)) return ms
  }
  return undefined
}

/** Extract readable text from an Anthropic Messages `content` value. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== "object") continue
    const b = block as Json
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text)
    } else if (b.type === "thinking" && typeof b.thinking === "string") {
      parts.push(`[thinking] ${b.thinking}`)
    } else if (b.type === "tool_use") {
      const name = typeof b.name === "string" ? b.name : "tool"
      parts.push(`[tool: ${name}] ${JSON.stringify(b.input ?? {}).slice(0, 1500)}`)
    } else if (b.type === "tool_result") {
      const value =
        typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "")
      parts.push(`[tool result] ${value.slice(0, 1500)}`)
    }
  }
  return parts.join("\n").trim()
}

function messageText(entry: Json): string {
  if (typeof entry.message === "string") return entry.message
  const message = entry.message as Json | undefined
  return textOf(message?.content)
}

/** Read only the first chunk of a JSONL file, dropping a possibly partial last line. */
async function readHead(path: string): Promise<Json[]> {
  const handle = await open(path, "r")
  try {
    const buf = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await handle.read(buf, 0, HEAD_BYTES, 0)
    const lines = buf.subarray(0, bytesRead).toString("utf8").split("\n")
    if (bytesRead === HEAD_BYTES) lines.pop()
    return lines
      .map(parse)
      .filter((value): value is Json => value !== undefined)
  } finally {
    await handle.close()
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = cursor++
        if (index >= items.length) return
        out[index] = await fn(items[index])
      }
    },
  )
  await Promise.all(workers)
  return out
}

class ClaudeSource implements SourceAdapter {
  readonly id = "claude"

  /** In-memory index keyed by path. No transcript content is ever persisted by us. */
  private meta = new Map<string, Meta>()
  private paths = new Map<string, string>()

  home(): string {
    return join(homedir(), ".claude")
  }

  /** `~/.claude/sessions/*.json` holds live sessions with a human name and status. */
  private async live(): Promise<Map<string, Json>> {
    const dir = join(this.home(), "sessions")
    const result = new Map<string, Json>()
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return result
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue
      try {
        const data = JSON.parse(await readFile(join(dir, name), "utf8")) as Json
        if (typeof data.sessionId === "string") result.set(data.sessionId, data)
      } catch {
        // A stale or half-written index file is not fatal.
      }
    }
    return result
  }

  private toSummary(localId: string, path: string, m: Meta): SessionSummary {
    return {
      id: `${this.id}:${localId}`,
      source: this.id,
      title: m.title,
      directory: m.directory,
      project: m.project,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      status: m.status,
      size: m.size,
      path,
    }
  }

  async list(): Promise<SessionSummary[]> {
    const root = join(this.home(), "projects")
    const live = await this.live()

    let projects: string[]
    try {
      const entries = await readdir(root, { withFileTypes: true })
      projects = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch {
      return []
    }

    // Only the .jsonl files directly under projects/<encoded-cwd>/ are real
    // sessions. Nested <session-uuid>/subagents/agent-*.jsonl files are logs of
    // subagents belonging to a parent session, not standalone conversations,
    // so listing them would flood the panel with duplicates.
    const files: Array<{ path: string; project: string; localId: string }> = []
    for (const project of projects) {
      const dir = join(root, project)
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        continue
      }
      for (const name of names) {
        if (!name.endsWith(".jsonl")) continue
        const localId = name.slice(0, -6)
        const path = join(dir, name)
        this.paths.set(localId, path)
        files.push({ path, project, localId })
      }
    }

    const rows = await mapLimit(files, LIST_CONCURRENCY, async (file) => {
      let info
      try {
        info = await stat(file.path)
      } catch {
        return undefined
      }
      const stamp = `${info.mtimeMs}:${info.size}`
      const cached = this.meta.get(file.path)

      if (cached && cached.stamp === stamp) {
        return this.toSummary(file.localId, file.path, cached)
      }

      let head: Json[] = []
      try {
        head = await readHead(file.path)
      } catch {
        // Unreadable file: still list it with a minimal label.
      }

      let title = ""
      let directory = ""
      let createdAt = 0
      let sessionId = file.localId

      for (const entry of head) {
        if (entry.type === "summary" && typeof entry.summary === "string" && !title) {
          title = entry.summary
        }
        if (entry.type !== "user") continue
        if (!directory && typeof entry.cwd === "string") directory = entry.cwd
        if (typeof entry.sessionId === "string") sessionId = entry.sessionId
        if (!createdAt) createdAt = timeOf(entry.timestamp) ?? 0
        if (!title) title = messageText(entry)
        if (directory && title) break
      }

      const liveInfo = live.get(sessionId) ?? live.get(file.localId)
      if (liveInfo) {
        if (typeof liveInfo.name === "string" && liveInfo.name) title = liveInfo.name
        if (typeof liveInfo.cwd === "string" && liveInfo.cwd) directory = liveInfo.cwd
        if (typeof liveInfo.startedAt === "number") createdAt = liveInfo.startedAt
      }

      const meta: Meta = {
        stamp,
        title: (title || sessionId.slice(0, 8)).replace(/\s+/g, " ").slice(0, 140),
        directory: directory || file.project,
        project: file.project,
        createdAt: createdAt || info.mtimeMs,
        updatedAt: Math.max(info.mtimeMs, createdAt || 0),
        status: typeof liveInfo?.status === "string" ? liveInfo.status : "archived",
        size: info.size,
        sessionId,
      }
      this.meta.set(file.path, meta)
      return this.toSummary(file.localId, file.path, meta)
    })

    return rows.filter((row): row is SessionSummary => row !== undefined)
  }

  /** Lazy: read exactly one transcript, only when the user joins that session. */
  async read(localId: string): Promise<Transcript> {
    let path = this.paths.get(localId)
    if (!path) {
      await this.list()
      path = this.paths.get(localId)
    }
    if (!path) throw new Error(`Unknown session: ${localId}`)

    const raw = await readFile(path, "utf8")
    const turns: TranscriptTurn[] = []
    let directory = ""
    let sessionId = localId
    let createdAt = 0
    let updatedAt = 0

    for (const line of raw.split("\n")) {
      const entry = parse(line)
      if (!entry) continue
      if (!directory && typeof entry.cwd === "string") directory = entry.cwd
      if (typeof entry.sessionId === "string") sessionId = entry.sessionId
      const timestamp = timeOf(entry.timestamp)
      if (timestamp !== undefined) {
        if (!createdAt) createdAt = timestamp
        if (timestamp > updatedAt) updatedAt = timestamp
      }
      if (entry.type !== "user" && entry.type !== "assistant") continue
      const text = messageText(entry)
      if (!text) continue
      turns.push({
        role: entry.type === "user" ? "user" : "assistant",
        text: text.slice(0, MAX_TEXT),
        timestamp: timestamp ?? createdAt ?? Date.now(),
      })
    }

    // Deterministic safety cap for pathological transcripts. No LLM summarising.
    if (turns.length > MAX_TURNS) turns.splice(0, turns.length - MAX_TURNS)

    return {
      sessionId,
      source: this.id,
      directory: directory || homedir(),
      createdAt: createdAt || Date.now(),
      updatedAt: updatedAt || Date.now(),
      turns,
    }
  }
}

export const claudeSource: SourceAdapter = new ClaudeSource()
