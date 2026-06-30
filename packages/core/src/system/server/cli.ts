/**
 * Sidecar CLI 入口 — 作为独立进程启动
 * node dist/server/cli.js --port 3456 --token abc123 --userData "path/to/data"
 */

import { startServer } from "./server"
import { initPlatformPaths } from "../platform-paths"

const args = process.argv.slice(2)
const portIdx = args.indexOf("--port")
const tokenIdx = args.indexOf("--token")
const userDataIdx = args.indexOf("--userData")

const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 3456
const authToken = tokenIdx >= 0 ? args[tokenIdx + 1] : undefined
const userData = userDataIdx >= 0 ? args[userDataIdx + 1] : process.env.MIRA_USER_DATA || ""

if (userData) {
  initPlatformPaths({ userData, home: process.env.HOME || process.env.USERPROFILE || "/tmp" })
}

console.log(`[Sidecar] Starting @mira/core server on port ${port}...`)

startServer({ port, authToken })
  .then(({ port, token }) => {
    // 输出 JSON 供父进程读取
    console.log(JSON.stringify({ event: "ready", port, token }))
  })
  .catch((err) => {
    console.error(`[Sidecar] Failed to start: ${err.message}`)
    process.exit(1)
  })
