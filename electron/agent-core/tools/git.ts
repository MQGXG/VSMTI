import { execFile } from "child_process"
import { promisify } from "util"
import { z } from "zod"
import { make } from "../tool"

const execAsync = promisify(execFile)

function git(args: string[], cwd: string): Promise<string> {
  return execAsync("git", args, { cwd, timeout: 15000 }).then(r => r.stdout)
}

export const gitStatusTool = make({
  name: "git_status",
  description: "Show working tree status (equivalent to git status --short). Returns list of changed files.",
  inputSchema: z.object({
    path: z.string().optional().describe("Git repo path (default: workspace)"),
  }),
  outputSchema: z.string(),
  async execute(input, ctx) {
    const cwd = input.path || ctx.workspace
    try {
      const stdout = await git(["status", "--short"], cwd)
      return { success: true, output: stdout || "(working tree clean)" }
    } catch (e: any) {
      return { success: false, error: e.stderr || e.message }
    }
  },
})

export const gitDiffTool = make({
  name: "git_diff",
  description: "Show unstaged diff (equivalent to git diff). Shows changes not yet staged.",
  inputSchema: z.object({
    path: z.string().optional().describe("Git repo path"),
    file: z.string().optional().describe("Specific file path to show diff for"),
  }),
  outputSchema: z.string(),
  async execute(input, ctx) {
    const cwd = input.path || ctx.workspace
    try {
      const args = ["diff", "--no-color"]
      if (input.file) args.push(input.file)
      const stdout = await git(args, cwd)
      return { success: true, output: stdout || "(no changes)" }
    } catch (e: any) {
      return { success: false, error: e.stderr || e.message }
    }
  },
})

export const gitLogTool = make({
  name: "git_log",
  description: "Show recent commit history (equivalent to git log --oneline).",
  inputSchema: z.object({
    path: z.string().optional().describe("Git repo path"),
    maxCount: z.number().optional().default(20).describe("Maximum number of commits to show"),
  }),
  outputSchema: z.string(),
  async execute(input, ctx) {
    const cwd = input.path || ctx.workspace
    try {
      const stdout = await git(["log", `--max-count=${input.maxCount || 20}`, "--oneline", "--no-color"], cwd)
      return { success: true, output: stdout || "(no commits)" }
    } catch (e: any) {
      return { success: false, error: e.stderr || e.message }
    }
  },
})

export const gitCommitTool = make({
  name: "git_commit",
  description: "Create a git commit with all staged changes.",
  inputSchema: z.object({
    path: z.string().optional().describe("Git repo path"),
    message: z.string().describe("Commit message"),
  }),
  outputSchema: z.string(),
  permission: "git_commit",
  async execute(input, ctx) {
    const cwd = input.path || ctx.workspace
    try {
      const stdout = await git(["commit", "-m", input.message], cwd)
      return { success: true, output: stdout || "(commit created)" }
    } catch (e: any) {
      return { success: false, error: e.stderr || e.message }
    }
  },
})
