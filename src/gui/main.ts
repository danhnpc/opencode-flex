import { watch, type FSWatcher } from "node:fs"
import type { Plugin } from "@opencode/plugin/gui"
import { SessionsIpc } from "./contract"
import { claudeSource } from "../sources/claude"
import { buildTransfer, type TransferClient } from "../core/transfer"
import type { SessionSummary } from "../core/types"

/**
 * Electron main process: owns the filesystem and the OpenCode client.
 * It never runs an agent, never calls a model, and never reads a transcript
 * until the user clicks Join in the panel.
 */
export const main: Plugin.MainSetup = (ctx) => {
  const sources = [claudeSource]
  let cache: SessionSummary[] = []
  let dirty = true
  let debounce: ReturnType<typeof setTimeout> | undefined
  let fsWatcher: FSWatcher | undefined

  const provider = ctx.provide(SessionsIpc, {
    list: async () => {
      if (!dirty && cache.length) return cache
      const lists = await Promise.all(
        sources.map((source) =>
          source.list().catch(() => [] as SessionSummary[]),
        ),
      )
      cache = lists.flat().sort((a, b) => b.updatedAt - a.updatedAt)
      dirty = false
      return cache
    },

    join: async (id: string) => {
      const separator = id.indexOf(":")
      const sourceId = separator === -1 ? sources[0].id : id.slice(0, separator)
      const localId = separator === -1 ? id : id.slice(separator + 1)
      const source = sources.find((s) => s.id === sourceId) ?? sources[0]

      // Read exactly one transcript. Pure local I/O, zero model tokens.
      const transcript = await source.read(localId)
      const summary = cache.find((s) => s.id === id)

      // Verified against @opencode/client@2.2.5 generated types.
      const client = ctx.client
      const payload = await buildTransfer(
        client as unknown as TransferClient,
        transcript,
        { title: summary?.title ?? transcript.sessionId, source: source.id },
      )

      const target = `ses_flex_${transcript.sessionId
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 40)}`
      payload.info.id = target

      // Idempotent: re-joining opens the session that was already imported
      // instead of creating a duplicate (the import endpoint returns 409).
      let exists = false
      try {
        await client.session.get({ sessionID: target })
        exists = true
      } catch {
        exists = false
      }
      if (!exists) {
        type ImportInput = Parameters<
          typeof client.experimental.session.import
        >[0]
        await client.experimental.session.import(
          payload as unknown as ImportInput,
        )
      }
      return target
    },
  })

  // Optional live refresh. Watching may fail on some filesystems; the panel's
  // Refresh button and the Ipc "changed" event still work without it.
  try {
    fsWatcher = watch(claudeSource.home(), { recursive: true }, () => {
      dirty = true
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => provider.emit("changed", true), 700)
    })
    // An async watch error must never take down the Electron main process.
    fsWatcher.on("error", () => {
      fsWatcher = undefined
    })
  } catch {
    fsWatcher = undefined
  }

  ctx.onCleanup(() => {
    if (debounce) clearTimeout(debounce)
    fsWatcher?.close()
    provider.dispose()
  })
}
