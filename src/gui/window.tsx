import {
  Command,
  MenuItem,
  Panel,
  TitlebarItem,
  createKeyed,
  type Command as CommandType,
  type PanelTab,
  type Plugin,
} from "@opencode/plugin/gui"
import { SessionsView } from "./view"
import type { definition } from "./definition"

const TAB = "sessions"

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const key = () => `${ctx.id}:${TAB}`

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
}
