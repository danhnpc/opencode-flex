import { onCleanup } from "solid-js"
import {
  Command,
  ComposerPill,
  MenuItem,
  Panel,
  Style,
  TitlebarItem,
  createKeyed,
  type Command as CommandType,
  type ComposerPillRow,
  type ComposerPillView,
  type PanelTab,
  type Plugin,
} from "@opencode/plugin/gui"
import { SessionsView } from "./view"
import type { definition } from "./definition"
import {
  agentFor,
  DEFAULT_MODE,
  MODES,
  permissionsFor,
  type FlexMode,
} from "../core/mode"

const TAB = "sessions"

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const key = () => `${ctx.id}:${TAB}`

  const iconFor = (mode: FlexMode) =>
    mode === "plan"
      ? "checklist"
      : mode === "manual"
        ? "edit"
        : "chevron-double-right"

  const toneFor = (mode: FlexMode) =>
    mode === "plan" ? "warning" : mode === "auto" ? "danger" : undefined

  /** Sessions we never touched keep OpenCode's native allow-all behaviour,
   * which is exactly what the "auto" label means. */
  const modeOf = (sessionID: string): FlexMode =>
    ctx.stores.modes.value.byId[sessionID] ?? DEFAULT_MODE

  const applyMode = (sessionID: string, mode: FlexMode) => {
    const client = ctx.client
    void Promise.all([
      client.session.switchAgent({ sessionID, agent: agentFor(mode) }),
      client.session.update({
        sessionID,
        permissions: permissionsFor(mode),
      }),
    ]).catch(() => ctx.toast.show({ title: ctx.t("mode.error") }))
  }

  const setMode = (sessionID: string, mode: FlexMode) => {
    ctx.stores.modes.set({
      byId: { ...ctx.stores.modes.value.byId, [sessionID]: mode },
    })
    applyMode(sessionID, mode)
  }

  const tab: PanelTab = {
    id: TAB,
    get title() {
      return ctx.t("panel.title")
    },
    // Always in the side strip, first, and never closed or dragged.
    pinned: true,
    closable: false,
    fallback: true,
  }

  ctx.add(Panel, {
    id: TAB,
    region: "side",
    list: () => [tab],
    render: () => <SessionsView />,
  })

  ctx.add(
    Command,
    (): CommandType => ({
      id: "open",
      title: ctx.t("command.open"),
      group: ctx.t("command.group"),
      run: () => {
        const session = ctx.sessions.current()
        if (session) ctx.layout.open(key(), session, { tab: "select" })
      },
    }),
  )

  ctx.add(MenuItem, (): MenuItem => ({
    menu: "session.panel",
    id: "open",
    title: ctx.t("panel.title"),
    order: 60,
    run: () => {
      const session = ctx.sessions.current()
      if (session) ctx.layout.open(key(), session, { tab: "select" })
    },
  }))

  ctx.add(TitlebarItem, (): TitlebarItem => ({
    id: "open",
    label: ctx.t("panel.title"),
    run: () => {
      const session = ctx.sessions.current()
      if (session) ctx.layout.open(key(), session, { tab: "select" })
    },
  }))

  // "Tu mo": whenever a session is routed, make sure our pinned tab is selected.
  createKeyed(
    () => ctx.sessions.current()?.id,
    () => {
      const session = ctx.sessions.current()
      if (session) ctx.layout.open(key(), session, { tab: "select" })
    },
  )

  // The mode pill above the composer, mirroring Claude Code's mode switcher.
  ctx.add(ComposerPill, {
    id: "mode",
    order: 10,
    show: (input): ComposerPillView => {
      const sessionID = input.session.id
      const current = modeOf(sessionID)
      return {
        label: ctx.t(`mode.${current}.label`),
        icon: iconFor(current),
        tone: toneFor(current),
        title: ctx.t("mode.title"),
        rows: MODES.map(
          (mode): ComposerPillRow => ({
            id: mode,
            label: ctx.t(`mode.${mode}.label`),
            detail: ctx.t(`mode.${mode}.detail`),
            icon: iconFor(mode),
            tone: toneFor(mode),
            run: () => setMode(sessionID, mode),
          }),
        ),
      }
    },
  })

  // The official ComposerPill registry renders its pills in the row ABOVE the
  // composer. The mode belongs next to the model / effort pickers, which live
  // inside `form[data-component="composer"] [data-slot="composer-controls"]`.
  // Move the plugin pill strip into that toolbar. This uses the app's own
  // data-slot (verified on 2.2.5) and degrades gracefully: if a future release
  // changes the selector, the pill simply stays in its original row.
  ctx.add(
    Style,
    `
[data-component="session-plugin-pills"][data-flex-relocated="true"] {
  order: 1;
  gap: 4px;
  margin-inline: 4px 2px;
}
[data-component="session-plugin-pills"][data-flex-relocated="true"] [data-slot="session-plugin-pill"] {
  height: 28px;
}
`.trim(),
  )

  const relocate = () => {
    if (typeof document === "undefined") return
    const pills = document.querySelector<HTMLElement>(
      '[data-component="session-plugin-pills"]',
    )
    const controls = document.querySelector<HTMLElement>(
      'form[data-component="composer"] [data-slot="composer-controls"] > div',
    )
    if (!pills || !controls || pills.parentElement === controls) return
    pills.dataset.flexRelocated = "true"
    controls.appendChild(pills)
  }

  let queued = false
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      relocate()
    })
  })
  const watch = () => {
    relocate()
    const root =
      document.querySelector('[data-component="session-composer-dock"]') ??
      document.body
    observer.observe(root, { childList: true, subtree: true })
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch, { once: true })
  } else {
    queueMicrotask(watch)
  }
  onCleanup(() => observer.disconnect())

  // Shift+Tab cycles plan -> manual -> auto, like Claude Code.
  ctx.add(
    Command,
    (): CommandType => ({
      id: "cycle-mode",
      title: ctx.t("mode.cycle"),
      group: ctx.t("command.group"),
      bind: "shift+tab",
      editable: true,
      run: () => {
        const session = ctx.sessions.current()
        if (!session || session.pending) return
        const current = modeOf(session.id)
        const next = MODES[(MODES.indexOf(current) + 1) % MODES.length]
        setMode(session.id, next)
      },
    }),
  )
}
