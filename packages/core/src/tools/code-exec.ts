import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { z } from "zod"
import { make } from "../tool"

const execFileAsync = promisify(execFile)

export const codeExecTool = make({
  name: "run_code",
  description: "Execute Python code in a temporary sandbox. Returns output or errors. Use when: calculating something, testing logic, processing data, running algorithms.",
  inputSchema: z.object({
    code: z.string().describe("Python code to execute"),
  }),
  outputSchema: z.string(),
  permission: "run_code",

  async execute(input, _ctx) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omni-"))
    const filePath = path.join(tmpDir, "script.py")
    await fs.writeFile(filePath, input.code, "utf-8")

    try {
      const { stdout, stderr } = await execFileAsync("python", [filePath], {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      })
      const output = (stdout || stderr).slice(0, 10000)
      return { success: true, output: output || "(no output)" }
    } catch (e: any) {
      const msg = e.stderr || e.stdout || e.message
      return { success: false, error: msg?.slice(0, 5000) }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  },
})
