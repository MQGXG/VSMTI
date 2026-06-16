import { spawn } from "child_process"
import { z } from "zod"
import { make } from "../tool"
import path from "path"

const HARD_DENY = ["rm -rf /", "sudo ", "shutdown", "reboot", "mkfs", "dd if="]

const MAX_OUTPUT_LENGTH = 50000
const MAX_CAPTURE_BYTES = 1024 * 1024

interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | null
  stdoutTruncated: boolean
  stderrTruncated: boolean
  timedOut: boolean
}

function runCommand(shell: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(shell, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""
    let stdoutTruncated = false
    let stderrTruncated = false
    let timedOut = false

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      setTimeout(() => { try { child.kill("SIGKILL") } catch {} }, 2000)
    }, timeoutMs)

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_CAPTURE_BYTES) {
        const remaining = MAX_CAPTURE_BYTES - stdout.length
        stdout += chunk.slice(0, remaining).toString("utf8")
        if (stdout.length >= MAX_CAPTURE_BYTES) stdoutTruncated = true
      }
    })

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_CAPTURE_BYTES) {
        const remaining = MAX_CAPTURE_BYTES - stderr.length
        stderr += chunk.slice(0, remaining).toString("utf8")
        if (stderr.length >= MAX_CAPTURE_BYTES) stderrTruncated = true
      }
    })

    child.on("error", (err) => {
      clearTimeout(timeout)
      resolve({ stdout, stderr, exitCode: null, stdoutTruncated, stderrTruncated, timedOut })
    })

    child.on("close", (code) => {
      clearTimeout(timeout)
      resolve({ stdout, stderr, exitCode: code, stdoutTruncated, stderrTruncated, timedOut })
    })
  })
}

function compactOutput(stdout: string, stderr: string): string {
  if (stdout && stderr) return `${stdout}\n\nstderr:\n${stderr}`
  if (stderr) return `stderr:\n${stderr}`
  return stdout
}

function captureNotice(truncated: boolean, label: string): string | undefined {
  return truncated ? `[${label} capture truncated at ${MAX_CAPTURE_BYTES / 1024}KB in-memory safety limit]` : undefined
}

function formatOutput(result: RunResult): string {
  const compact = compactOutput(result.stdout, stderrDisplay(result))
  const notice = [captureNotice(result.stdoutTruncated, "stdout"), captureNotice(result.stderrTruncated, "stderr")]
    .filter(Boolean)
  const parts = [compact, ...notice]
  if (result.timedOut) {
    parts.push("Command timed out before completion. Retry with a larger timeout if the command is expected to take longer.")
  }
  return parts.join("\n\n")
}

function stderrDisplay(result: RunResult): string {
  return result.timedOut && !result.stderr ? "(killed on timeout)" : result.stderr
}

function externalCommandDirs(command: string, cwd: string): string[] {
  const dirs = new Set<string>()
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
  for (const token of tokens) {
    const value = token.replace(/^(["'])(.*)\1$/, "$2").replace(/[;,&|]$/, "")
    if (!path.isAbsolute(value)) continue
    const resolved = path.resolve(value)
    if (resolved.startsWith(cwd)) continue
    dirs.add(path.dirname(resolved))
  }
  return [...dirs]
}

export const bashTool = make({
  name: "bash",
  description: "Execute a shell command and return its output. Use for building, testing, installing, and system operations.",
  inputSchema: z.object({
    command: z.string().describe("Shell command to execute"),
    timeout: z.number().optional().default(30).describe("Timeout in seconds (max 600)"),
  }),
  outputSchema: z.string(),
  permission: "bash",

  async execute(input, ctx) {
    for (const deny of HARD_DENY) {
      if (input.command.toLowerCase().includes(deny)) {
        return { success: false, error: `Hard denied: dangerous command pattern "${deny}"` }
      }
    }

    const cwd = ctx.workspace || process.cwd()
    const externalDirs = externalCommandDirs(input.command, cwd)
    const timeout = Math.min(input.timeout || 30, 600)
    const isWin = process.platform === "win32"
    const shell = ctx?.shell || (isWin ? "cmd" : "/bin/sh")
    const shellArgs = shell === "powershell" ? ["-Command", input.command]
      : shell === "cmd" || (!isWin && shell === "/bin/sh") ? (isWin ? ["/c", input.command] : ["-c", input.command])
      : isWin ? ["/c", input.command] : ["-c", input.command]

    const result = await runCommand(shell, shellArgs, timeout * 1000)

    if (result.timedOut) {
      return {
        success: false,
        error: `Command timed out after ${timeout}s. Retry with a larger timeout if the command is expected to take longer.`,
        metadata: { exitCode: result.exitCode },
      }
    }

    const output = formatOutput(result)
    const truncated = output.length > MAX_OUTPUT_LENGTH ? output.slice(0, MAX_OUTPUT_LENGTH) + `\n\n[Output truncated at ${MAX_OUTPUT_LENGTH / 1000}K characters]` : output

    return {
      success: result.exitCode === 0,
      output: truncated || "(no output)",
      metadata: {
        exitCode: result.exitCode,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated,
        ...(externalDirs.length > 0 ? { externalDirectories: externalDirs } : {}),
      },
    }
  },
})