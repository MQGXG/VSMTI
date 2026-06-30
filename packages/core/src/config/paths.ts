export interface PlatformPaths {
  userData: string
  home: string
}

let currentPaths: PlatformPaths = {
  userData: process.cwd(),
  home: process.env.HOME || process.env.USERPROFILE || "/tmp",
}

export function initPlatformPaths(paths: Partial<PlatformPaths>): void {
  if (paths.userData !== undefined) currentPaths.userData = paths.userData
  if (paths.home !== undefined) currentPaths.home = paths.home
}

export function getPlatformPaths(): PlatformPaths {
  return currentPaths
}
