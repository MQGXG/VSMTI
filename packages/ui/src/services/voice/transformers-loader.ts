/**
 * transformers.js 适配层 — 隔离模型加载与第三方类型缺陷
 *
 * transformers.js 3.0.0-alpha.2 的 `pipeline` 类型定义不完善（返回 unknown、
 * 不支持泛型）。为保持 voice 服务层的类型整洁，把模型加载与类型断言集中在本层。
 */

type ASRResult = { text?: string }

type TTSResult = { audio: Float32Array; sampling_rate: number }

export interface ASRPipeline {
  (audio: Float32Array, options?: { return_timestamps?: boolean }): Promise<ASRResult | Array<ASRResult> | undefined>
}

export interface TTSPipeline {
  (text: string, options?: Record<string, unknown>): Promise<TTSResult | undefined>
}

export async function loadASRPipeline(model: string): Promise<ASRPipeline> {
  const { pipeline } = await import("@huggingface/transformers")
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- 第三方类型缺陷，集中豁免
  const p = await pipeline("automatic-speech-recognition", model, { dtype: "q8" })
  return p as ASRPipeline
}

export async function loadTTSPipeline(model: string): Promise<TTSPipeline> {
  const { pipeline } = await import("@huggingface/transformers")
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- 第三方类型缺陷，集中豁免
  const p = await pipeline("text-to-speech", model, { dtype: "q8" })
  return p as TTSPipeline
}
