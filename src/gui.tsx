import { Plugin } from "@opencode/plugin/gui"
import { definition } from "./gui/definition"
import { setup } from "./gui/window"
import { main } from "./gui/main"

// `./gui-experimental` is one prebuilt CJS file. The same file is evaluated in
// every window (setup) and once in the Electron main process (main).
export default Plugin.define({ ...definition, setup, main })
