import * as path from "path"

export interface FileState {
  content: string
  mtimeMs: number
  byteLength: number
  offset?: number
  limit?: number
}

/** 跨工具文件状态缓存 — Read/Edit/Write 共享，防止并发修改冲突 */
const cache = new Map<string, FileState>()

/** 读取后存入缓存 */
export function setFileState(filePath: string, state: FileState): void {
  cache.set(path.resolve(filePath), state)
}

/** 获取缓存的文件状态 */
export function getFileState(filePath: string): FileState | undefined {
  return cache.get(path.resolve(filePath))
}

/** 检测文件是否已变化（比缓存中的 mtime 新） */
export function isFileChanged(filePath: string, currentMtimeMs: number): boolean {
  const state = cache.get(path.resolve(filePath))
  if (!state) return false
  return currentMtimeMs > state.mtimeMs
}

/** 写入/编辑后清除缓存 */
export function invalidateFileState(filePath: string): void {
  cache.delete(path.resolve(filePath))
}

/** 检测是否为重复读取（相同路径、相同分页参数、mtime 未变） */
export function isDuplicateRead(
  filePath: string,
  currentMtimeMs: number,
  currentByteLength: number,
  offset?: number,
  limit?: number,
): boolean {
  const state = cache.get(path.resolve(filePath))
  if (!state) return false
  return (
    state.mtimeMs === currentMtimeMs &&
    state.byteLength === currentByteLength &&
    state.offset === (offset || undefined) &&
    state.limit === (limit || undefined)
  )
}
