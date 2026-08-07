import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { z } from "zod"
import { make } from "../../shared/tool"

const execFileAsync = promisify(execFile)

export const codeExecTool = make({
  name: "run_code",
  description: "Execute code in a temporary sandbox (Python or Node.js). Returns output or errors. Use when: calculating something, testing logic, processing data, running algorithms. Choose language based on task: python for data analysis, node for JS/TS logic.",
  inputSchema: z.object({
    code: z.string().describe("Code to execute"),
    language: z.enum(["python", "node"]).optional().describe("Runtime: python (default) or node"),
  }),
  outputSchema: z.string(),
  permission: "run_code",

  async execute(input, _ctx) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omni-"))
    const isNode = input.language === "node"
    const filePath = path.join(tmpDir, isNode ? "script.mjs" : "script.py")
    await fs.writeFile(filePath, input.code, "utf-8")

    try {
      const { stdout, stderr } = await execFileAsync(isNode ? process.execPath : "python", [filePath], {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      })
      const output = (stdout || stderr).slice(0, 10000)
      return { success: true, output: output || "(no output)" }
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string }
      const msg = err.stderr || err.stdout || err.message
      return { success: false, error: msg?.slice(0, 5000) }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  },
})

