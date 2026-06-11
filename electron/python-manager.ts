import { spawn, ChildProcess } from "child_process";
import { join, resolve } from "path";
import { app } from "electron";
import http from "http";
import { existsSync } from "fs";

export class PythonManager {
  private process: ChildProcess | null = null;
  private port = 8230;
  private status: "stopped" | "starting" | "running" | "error" = "stopped";
  private errorMsg = "";

  private findPython(): string {
    // 优先使用项目内便携 Python
    const portablePython = resolve(__dirname, "../portable-python/Scripts/python.exe");
    if (existsSync(portablePython)) {
      console.log(`[PythonManager] Using portable: ${portablePython}`);
      return portablePython;
    }

    // 尝试通过 PATH 查找系统 Python
    try {
      const result = require("child_process").execSync("where python", { encoding: "utf8", timeout: 3000 });
      const lines = result.split("\n").map((s) => s.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.includes("WindowsApps") && existsSync(line)) return line;
      }
    } catch { /* ignore */ }

    throw new Error("未找到 Python。请安装 Python 3.10+ 或运行 setup.ps1 安装便携版。");
  }

  async start(): Promise<void> {
    this.status = "starting";
    this.errorMsg = "";

    const isDev = !app.isPackaged;
    const backendDir = resolve(__dirname, isDev ? "../agent-backend" : join(process.resourcesPath, "agent-backend"));

    console.log(`[PythonManager] isDev=${isDev}, backendDir=${backendDir}`);

    if (!existsSync(backendDir)) {
      this.errorMsg = `后端目录不存在: ${backendDir}`;
      this.status = "error";
      throw new Error(this.errorMsg);
    }

    let pythonExe: string;
    if (isDev) {
      pythonExe = this.findPython();
    } else {
      pythonExe = join(process.resourcesPath, "portable-python/Scripts/python.exe");
      if (!existsSync(pythonExe)) {
        this.errorMsg = "便携 Python 未找到，请重新安装应用";
        this.status = "error";
        throw new Error(this.errorMsg);
      }
    }

    const args = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(this.port)];
    console.log(`[PythonManager] Starting: ${pythonExe} ${args.join(" ")}`);

    this.process = spawn(pythonExe, args, {
      cwd: backendDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    this.process.stdout?.on("data", (data) => {
      const text = data.toString();
      console.log(`[Python] ${text}`);
      if (text.includes("Uvicorn running")) this.status = "running";
    });

    this.process.stderr?.on("data", (data) => {
      const text = data.toString();
      console.log(`[Python] ${text}`);
      if (text.includes("Uvicorn running")) this.status = "running";
    });

    this.process.on("exit", (code) => {
      console.log(`[Python] Exited with code ${code}`);
      this.status = "stopped";
      this.errorMsg = `进程退出 (code: ${code})`;
    });

    this.process.on("error", (err) => {
      this.errorMsg = err.message;
      console.error(`[PythonManager] Error: ${err.message}`);
    });

    await this.waitForReady();
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
      this.status = "stopped";
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  getStatus() {
    return { status: this.status, port: this.port, url: `http://127.0.0.1:${this.port}`, error: this.errorMsg };
  }

  private waitForReady(timeout = 20000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (this.status === "error") {
          reject(new Error(this.errorMsg || "启动失败")); return;
        }
        const req = http.get(`http://127.0.0.1:${this.port}/health`, (res) => {
          if (res.statusCode === 200) { this.status = "running"; resolve(); }
        });
        req.on("error", () => {
          if (Date.now() - startTime > timeout) {
            this.status = "error";
            this.errorMsg = "健康检查超时";
            reject(new Error("Python 后端启动超时"));
          } else {
            setTimeout(check, 500);
          }
        });
      };
      check();
    });
  }
}
