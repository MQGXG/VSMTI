import { execSync } from "child_process";
import { resolve } from "path";
import { app } from "electron";
import { existsSync } from "fs";

export interface PythonFinderResult {
  pythonExe: string;
  backendDir: string;
}

export function findPython(isDev: boolean): string {
  const tried: string[] = [];
  const appPath = app.getAppPath();

  // 1. 便携 Python
  const searchDirs = isDev
    ? [
        process.cwd(),
        resolve(__dirname, ".."),
        __dirname,
        process.env.INIT_CWD || "",
        appPath,
        resolve(appPath, ".."),
      ]
    : [process.resourcesPath, appPath, resolve(appPath, "..")];

  for (const base of searchDirs) {
    if (!base) continue;
    const pp = resolve(base, "portable-python/Scripts/python.exe");
    tried.push(`portable(${base}): ${pp}`);
    if (existsSync(pp)) return pp;
  }

  // 2. 已知系统路径
  const knownPaths = [
    "C:\\Users\\Devenv114\\AppData\\Local\\Programs\\Python\\Python310\\python.exe",
    "C:\\Program Files\\Python310\\python.exe",
    "C:\\Python310\\python.exe",
  ];
  for (const p of knownPaths) {
    tried.push(`known: ${p}`);
    if (existsSync(p)) return p;
  }

  // 3. where python
  try {
    const result = execSync("where python", { encoding: "utf8", timeout: 3000 });
    for (const line of result.split("\n").map((s) => s.trim()).filter(Boolean)) {
      tried.push(`where: ${line}`);
      if (!line.includes("WindowsApps") && existsSync(line)) return line;
    }
  } catch (e: any) {
    tried.push(`where error: ${e.message}`);
  }

  // 4. py launcher
  try {
    const result = execSync('py -3.10 -c "import sys; print(sys.executable)"', { encoding: "utf8", timeout: 3000 });
    const p = result.trim();
    tried.push(`py: ${p}`);
    if (p && existsSync(p)) return p;
  } catch (e: any) {
    tried.push(`py error: ${e.message}`);
  }

  throw new Error(`未找到 Python。已搜索: ${tried.join(", ")}。请运行 .\\setup.ps1 创建便携环境，或安装 Python 3.10+。`);
}

export function findBackendDir(isDev: boolean): string {
  const appPath = app.getAppPath();
  const searchDirs = isDev
    ? [process.cwd(), resolve(__dirname, ".."), __dirname, process.env.INIT_CWD || "", appPath, resolve(appPath, "..")]
    : [process.resourcesPath, appPath, resolve(appPath, "..")];

  for (const base of searchDirs) {
    if (!base) continue;
    const candidate = resolve(base, "agent-backend");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`后端目录不存在（已搜索 ${searchDirs.join(", ")}）`);
}
