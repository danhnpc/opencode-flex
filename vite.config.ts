import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

// Produces one CommonJS file at dist/gui-experimental.cjs.
// OpenCode Desktop loads that single file in both the window (setup) and the
// Electron main process (main), so dynamic imports and extra chunks are not
// allowed. The preset keeps app-provided modules external.
export default defineConfig({ plugins: [gui()] })
