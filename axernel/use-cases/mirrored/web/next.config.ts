import type { NextConfig } from "next"

const config: NextConfig = {
  // Both are loaded by Node at runtime: one is a native addon, the other a
  // symlinked file: dependency whose own node_modules must resolve.
  agentRules: false,
  serverExternalPackages: ["better-sqlite3", "@axernel/sdk"],
}

export default config
