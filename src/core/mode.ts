/**
 * The three working modes shown by the composer pill, mirroring the mode
 * switcher in Claude Code (plan / default / auto).
 *
 * Pure data: safe to import from both the window and the Electron main process.
 */

export type FlexMode = "plan" | "manual" | "auto"

export const MODES: readonly FlexMode[] = ["plan", "manual", "auto"]

/**
 * OpenCode's built-in base policy is already allow-all (only `.env` reads ask),
 * so "auto" is the honest initial label: it means "no session override".
 * "manual" is the one that has to actively add `ask` rules.
 */
export const DEFAULT_MODE: FlexMode = "auto"

export function isMode(value: string): value is FlexMode {
  return value === "plan" || value === "manual" || value === "auto"
}

export function agentFor(mode: FlexMode): "plan" | "build" {
  return mode === "plan" ? "plan" : "build"
}

export interface FlexPermissionRule {
  action: string
  resource: string
  effect: "allow" | "deny" | "ask"
}

/**
 * Session-level rules written with `session.update({ permissions })`.
 * Session rules are appended after global and agent rules, so the last match
 * wins. An empty array removes our override and restores native behaviour.
 */
export function permissionsFor(mode: FlexMode): FlexPermissionRule[] {
  if (mode === "manual") {
    return [
      { action: "edit", resource: "*", effect: "ask" },
      { action: "shell", resource: "*", effect: "ask" },
    ]
  }
  return []
}
