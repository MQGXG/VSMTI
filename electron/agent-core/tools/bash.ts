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

  async execute(input, ctx) {
    for (const deny of HARD_DENY) {
      if (input.command.toLowerCase().includes(deny)) {
        return { success: false, error: `Hard denied: dangerous command pattern "${deny}"` }
      }
    }

    try {
      const isWin = process.platform === "win32"
      const shell = ctx?.shell || (isWin ? "cmd" : "/bin/sh")
      const shellArgs = shell === "powershell" ? ["-Command", input.command]
        : shell === "cmd" || (!isWin && shell === "/bin/sh") ? (isWin ? ["/c", input.command] : ["-c", input.command])
        : isWin ? ["/c", input.command] : ["-c", input.command]
      const { stdout, stderr } = await execFileAsync(shell, shellArgs,
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
      return { success: false, error: (msg || "Command execution failed").slice(0, 5000) }
    }
  },
})
