/**
 * 模型识图策略决策模块（② 应用逻辑层唯一决策点）
 *
 * 职责：
 * - 判断模型类型（用户声明优先，内置模型查 VISION_MODELS 兜底）
 * - 决策识图策略：direct（直发图片）/ bridge（视觉桥描述）/ blocked（阻止发送）
 * - 图片安全校验（数量 / 大小 / 格式白名单）
 *
 * 分层约定：
 * - 只依赖 provider-data.ts 的数据访问，不触碰 IPC / 核心层
 * - 决策结果由上层（session-runtime-store / useVisionPolicy）装配成 config
 */
import type { Provider, ModelType } from "./types"
import { getProviderById, loadProviders } from "./provider-data"

/** 内置支持视觉（vision）的模型清单（provider → model ids） */
const VISION_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4-turbo"],
  anthropic: [
    "claude-sonnet-4-20250514", "claude-4-20250514", "claude-opus-4-20250514",
    "claude-haiku-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022",
  ],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro-preview-03-25"],
  vertex: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
}

/** 归一化 provider id：custom- 前缀映射为 custom */
function normalizeProviderId(id: string): string {
  return id.startsWith("custom-") ? "custom" : id
}

/** 模型类型是否支持直接识图（vision / multimodal） */
export function isVisionType(type?: ModelType): boolean {
  return type === "vision" || type === "multimodal"
}

/**
 * 判断 provider/model 是否具备视觉能力。
 * 优先级：内置白名单（权威）> 用户声明的 type（vision/multimodal）。
 * 内置模型即使被历史数据默认标记为 "text"，白名单仍能正确识别（避免识图误判）。
 */
export function isVisionModel(
  provider: string,
  modelId: string,
  modelType?: ModelType,
): boolean {
  // ① 内置白名单命中 → 支持视觉（权威，优先于默认 "text" 污染）
  const list = VISION_MODELS[provider]
  if (list && list.includes(modelId)) return true
  // ② 用户显式声明 vision/multimodal → 支持视觉
  if (isVisionType(modelType)) return true
  // ③ 其余（text/voice/未知）→ 不支持
  return false
}

/** 视觉桥模型候选（含鉴权信息） */
export interface VisionBridgeCandidate {
  provider: string
  model: string
  apiKey: string
  apiUrl?: string
  headers?: Record<string, string>
  options?: Record<string, unknown>
}

/** 识图策略决策结果 */
export type VisionPolicy =
  | { strategy: "direct" }
  | { strategy: "bridge"; visionModel: VisionBridgeCandidate }
  | { strategy: "blocked"; reason: string }

/**
 * 从已配置 provider 中寻找可用的视觉模型（启用 + 有 apiKey）。
 * 优先用户声明的 vision/multimodal 类型，其次内置 VISION_MODELS 白名单。
 */
export async function findVisionBridgeModel(providers: Provider[]): Promise<VisionBridgeCandidate | null> {
  for (const p of providers) {
    if (!p.enabled) continue
    const pid = normalizeProviderId(p.id)
    const visionIds = VISION_MODELS[pid] || []
    const visionModel = p.models.find((m) => {
      if (!m.enabled) return false
      if (m.type && isVisionType(m.type)) return true
      return visionIds.includes(m.id)
    })
    if (!visionModel) continue
    const info = await getProviderById(pid)
    if (info?.apiKey) {
      return {
        provider: pid,
        model: visionModel.id,
        apiKey: info.apiKey,
        apiUrl: info.apiUrl,
        headers: info.headers,
        options: info.options,
      }
    }
  }
  return null
}

/**
 * 决策识图策略（唯一决策入口）。
 *
 * 规则：
 * 1. 用户手动指定的视觉桥模型（override）优先
 * 2. 当前模型 type 为 vision/multimodal（或内置白名单命中）→ direct 直发
 * 3. 其余类型（text/voice/未标记/未知）→ 自动推导视觉桥模型
 *    - 找到 → bridge
 *    - 找不到 → blocked（上层应提示且不发送图片）
 */
export async function decideVisionPolicy(
  currentProvider: string,
  currentModel: string,
  currentType?: ModelType,
  override?: { provider: string; model: string },
): Promise<VisionPolicy> {
  // 1) 用户手动指定的视觉桥模型（设置面板覆盖）
  if (override?.provider && override?.model) {
    const info = await getProviderById(override.provider)
    if (info?.apiKey) {
      return {
        strategy: "bridge",
        visionModel: {
          provider: override.provider,
          model: override.model,
          apiKey: info.apiKey,
          apiUrl: info.apiUrl,
          headers: info.headers,
          options: info.options,
        },
      }
    }
  }

  // 2) 当前模型本身支持视觉 → 直发图片
  if (isVisionModel(currentProvider, currentModel, currentType)) {
    return { strategy: "direct" }
  }

  // 3) 非视觉模型 → 自动推导视觉桥模型
  const providers = await loadProviders()
  const bridge = await findVisionBridgeModel(providers)
  if (bridge) return { strategy: "bridge", visionModel: bridge }
  return {
    strategy: "blocked",
    reason: "当前模型不支持识图，且未配置可用的视觉桥模型。请在设置中添加并启用一个视觉模型，或更换为支持视觉的模型。",
  }
}

// ── 图片安全校验 ──────────────────────────────────────

export const MAX_IMAGE_COUNT = 4
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024 // 4MB

/** 校验图片 data URL：仅接受 data:image/*;base64 格式白名单 */
export function isValidImageDataUrl(url: string): boolean {
  return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(url)
}

/** 校验图片 base64 体积（去除 data URL 前缀后） */
export function imageDataSize(url: string): number {
  const comma = url.indexOf(",")
  if (comma < 0) return 0
  const b64 = url.slice(comma + 1)
  return Math.floor((b64.length * 3) / 4)
}

export interface ImageValidation {
  ok: boolean
  reason?: string
}

/**
 * 批量校验上传图片（数量 / 大小 / 格式）。
 * 失败返回原因，供上层提示并阻止发送。
 */
export function validateImages(images: string[]): ImageValidation {
  if (images.length === 0) return { ok: true }
  if (images.length > MAX_IMAGE_COUNT) {
    return { ok: false, reason: `一次最多上传 ${MAX_IMAGE_COUNT} 张图片` }
  }
  for (const img of images) {
    if (!isValidImageDataUrl(img)) {
      return { ok: false, reason: "仅支持 PNG / JPG / GIF / WebP 图片" }
    }
    if (imageDataSize(img) > MAX_IMAGE_BYTES) {
      return { ok: false, reason: "单张图片不能超过 4MB" }
    }
  }
  return { ok: true }
}
