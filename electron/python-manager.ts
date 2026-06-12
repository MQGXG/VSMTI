import { spawn, ChildProcess } from "child_process";
import { app } from "electron";
import http from "http";
import { WriteStream } from "fs";
import { logToFile, createPythonLogStream } from "./utils/logger";
import { findPython, findBackendDir } from "./utils/python-finder";

export interface LogEntry {
  timestamp: string;
  level: "info" | "error";
  message: string;
}

export class PythonManager {
  private process: ChildProcess | null = null;
  private port = 8230;
  private status: "stopped" | "starting" | "running" | "error" = "stopped";
  private errorMsg = "";
  private logs: LogEntry[] = [];
  private readonly maxLogEntries = 500;
  private readonly startTimeout = 30_000; // 30s 启动超时
  private readonly stopTimeout = 6_000;   // 6s 停止超时
  private pythonLogStream: WriteStream | null = null;

  private addLog(level: "info" | "error", message: string) {
    const entry = { timestamp: new Date().toISOString(), level, message };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogEntries) {
      this.logs.shift();
    }
    const prefix = "[Python]";
    if (level === "error") {
      console.error(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }
    logToFile(level === "error" ? "ERROR" : "INFO", `${prefix} ${message}`);

    // 同时写入 Python 专属日志文件
    if (this.pythonLogStream && !this.pythonLogStream.destroyed) {
      this.pythonLogStream.write(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`);
    }
  }

  async start(): Promise<void> {
    if (this.process) {
      this.addLog("info", "Python backend already running, skipping start");
      return;
    }

    this.status = "starting";
    this.errorMsg = "";
    this.logs = [];

    // 创建每日 Python 日志文件流
    if (this.pythonLogStream) {
      try { this.pythonLogStream.end(); } catch {}
    }
    this.pythonLogStream = createPythonLogStream();

    const isDev = !app.isPackaged;
    this.addLog("info", `Starting Python backend (dev=${isDev})`);

    let backendDir: string;
    try {
      backendDir = findBackendDir(isDev);
    } catch (err: any) {
      this.errorMsg = err.message;
      this.status = "error";
      this.addLog("error", err.message);
      throw err;
    }

    let pythonExe: string;
    try {
      pythonExe = findPython(isDev);
    } catch (err: any) {
      this.errorMsg = err.message;
      this.status = "error";
      throw err;
    }

    const args = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(this.port)];
    this.addLog("info", `Spawning: ${pythonExe} ${args.join(" ")}`);

    return new Promise<void>((resolve, reject) => {
      let timedOut = false;
      let startTimer: NodeJS.Timeout | null = null;
      let healthCheckTimer: NodeJS.Timeout | null = null;
      let resolved = false;

      const cleanup = () => {
        if (startTimer) clearTimeout(startTimer);
        if (healthCheckTimer) clearTimeout(healthCheckTimer);
      };

      const fail = (err: Error) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        this.status = "error";
        this.errorMsg = err.message;
        this.addLog("error", `Startup failed: ${err.message}`);
        // 确保进程被清理
        if (this.process && !this.process.killed) {
          this.process.kill("SIGTERM");
          setTimeout(() => {
            if (this.process && !this.process.killed) {
              this.process.kill("SIGKILL");
            }
          }, 2000);
        }
        reject(err);
      };

      const succeed = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        this.status = "running";
        this.addLog("info", "Python backend is ready");
        resolve();
      };

      // 启动超时
      startTimer = setTimeout(() => {
        timedOut = true;
        fail(new Error(`Python 后端启动超时 (${this.startTimeout}ms)，请检查控制台日志`));
      }, this.startTimeout);

      try {
        this.process = spawn(pythonExe, args, {
          cwd: backendDir,
          stdio: ["ignore", "pipe", "pipe"], // stdin 不需要
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
          windowsHide: true, // Windows 下隐藏控制台窗口
        });
      } catch (spawnErr: any) {
        fail(new Error(`创建进程失败: ${spawnErr.message}`));
        return;
      }

      // stdout 日志收集
      this.process.stdout?.on("data", (data: Buffer) => {
        const lines = data.toString("utf8").split("\n").map((s) => s.trimEnd()).filter(Boolean);
        for (const line of lines) {
          this.addLog("info", `[stdout] ${line}`);
          // 检测到 Uvicorn 启动成功，开始健康检查
          if (line.includes("Uvicorn running") || line.includes("Application startup complete")) {
            this.addLog("info", "Detected Uvicorn startup, beginning health checks");
            beginHealthChecks();
          }
        }
      });

      // stderr 日志收集
      this.process.stderr?.on("data", (data: Buffer) => {
        const lines = data.toString("utf8").split("\n").map((s) => s.trimEnd()).filter(Boolean);
        for (const line of lines) {
          this.addLog("error", `[stderr] ${line}`);
        }
      });

      // 进程退出
      this.process.on("exit", (code, signal) => {
        this.addLog("info", `Process exited with code=${code}, signal=${signal}`);
        if (!resolved && !timedOut) {
          fail(new Error(`Python 进程意外退出 (code: ${code})`));
        }
        this.process = null;
        this.status = "stopped";
      });

      this.process.on("error", (err) => {
        this.addLog("error", `Process error: ${err.message}`);
        if (!resolved) fail(err);
      });

      // 健康检查轮询
      let healthCheckCount = 0;
      const maxHealthChecks = 60; // 最多检查 60 次（30s / 500ms）

      const checkHealth = () => {
        if (resolved || timedOut) return;
        healthCheckCount++;

        const req = http.get(`http://127.0.0.1:${this.port}/health`, { timeout: 2000 }, (res) => {
          if (res.statusCode === 200) {
            this.addLog("info", `Health check passed (#${healthCheckCount})`);
            succeed();
          } else {
            scheduleNextCheck();
          }
        });

        req.on("error", (err) => {
          if (healthCheckCount >= maxHealthChecks) {
            fail(new Error(`健康检查失败 ${maxHealthChecks} 次: ${err.message}`));
          } else {
            scheduleNextCheck();
          }
        });

        req.on("timeout", () => {
          req.destroy();
          scheduleNextCheck();
        });
      };

      const scheduleNextCheck = () => {
        if (!resolved && !timedOut) {
          healthCheckTimer = setTimeout(checkHealth, 500);
        }
      };

      const beginHealthChecks = () => {
        if (healthCheckTimer) return; // 已经在检查了
        checkHealth();
      };

      // 兜底：即使没有检测到 Uvicorn 日志，5s 后也开始健康检查
      setTimeout(() => {
        if (!resolved && !timedOut) {
          this.addLog("info", "Starting health checks (fallback)");
          beginHealthChecks();
        }
      }, 5000);
    });
  }

  async stop(): Promise<void> {
    if (!this.process) {
      this.status = "stopped";
      return;
    }

    this.addLog("info", "Stopping Python backend...");
    const proc = this.process;

    return new Promise<void>((resolve) => {
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        this.process = null;
        this.status = "stopped";
        resolve();
      };

      // 先尝试优雅终止
      proc.on("exit", () => {
        if (this.pythonLogStream) {
          this.pythonLogStream.end();
          this.pythonLogStream = null;
        }
        finish();
      });
      proc.kill("SIGTERM");

      // 超时后强制终止
      setTimeout(() => {
        if (!proc.killed) {
          this.addLog("error", "SIGTERM timeout, forcing SIGKILL");
          proc.kill("SIGKILL");
        }
        // 再等 1s 确保进程已退出
        setTimeout(finish, 1000);
      }, this.stopTimeout);
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  getStatus() {
    return {
      status: this.status,
      port: this.port,
      url: `http://127.0.0.1:${this.port}`,
      error: this.errorMsg,
    };
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }
}
