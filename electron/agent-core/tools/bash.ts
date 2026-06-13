import { execFile } from "child_process"
import { promisify } from "util"
import { z } from "zod"
import { make } from "../tool"

const execFileAsync = promisify(execFile)

const HARD_DENY = ["rm -rf /", "sudo ", "shutdown", "reboot", "mkfs", "dd if="]

export const bashTool = make({
  name: "bash",
  description: "Execute a shell command and return its output. Use for building, testing, installing, and system operations.",
  inputSchema: z.object({
    command: z.string().describe("Shell command to execute"),
    timeout: z.number().optional().default(30).describe("Timeout in seconds"),
  }),
  outputSchema: z.string(),
  permission: "bash",

  async execute(input, _ctx) {
    for (const deny of HARD_DENY) {
      if (input.command.toLowerCase().includes(deny)) {
        return { success: false, error: `Hard denied: dangerous command pattern "${deny}"` }
      }
    }

    try {
      const isWin = process.platform === "win32"
      const { stdout, stderr } = await execFileAsync(
        isWin ? "cmd" : "/bin/sh",
        isWin ? ["/c", input.command] : ["-c", input.command],
        {
          timeout: (input.timeout || 30) * 1000,
          maxBuffer: 1024 * 1024,
          shell: false,
        }
      )
      const output = (stdout || stderr).slice(0, 50000)
      return { success: true, output: output || "(no output)" }
    } catch (e: any) {
      const msg = e.stderr || e.stdout || e.message
      return { success: true, output: (msg || "").slice(0, 5000) }
    }
  },
})
