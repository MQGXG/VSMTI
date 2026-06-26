import { estimateTokens } from "../message-utils"
import type { LLMMessage } from "../llm-sdk"

const DOOM_LOOP_THRESHOLD = 3

export interface ToolCallRecord {
  name: string
  args: string
}

export function detectDoomLoop(
  currentCall: ToolCallRecord,
  recentCalls: ToolCallRecord[],
): boolean {
  const lastThree = recentCalls.slice(-DOOM_LOOP_THRESHOLD)
  if (lastThree.length !== DOOM_LOOP_THRESHOLD) return false

  return lastThree.every(
    (tc) => tc.name === currentCall.name && tc.args === currentCall.args,
  )
}

export function detectTextNgramRepeat(text: string, windowSize = 3): boolean {
  if (text.length < windowSize * 3) return false
  const ngrams = new Set<string>()
  let repeats = 0
  for (let i = 0; i <= text.length - windowSize; i++) {
    const ngram = text.slice(i, i + windowSize)
    if (ngrams.has(ngram)) {
      repeats++
      if (repeats >= 5) return true
    }
    ngrams.add(ngram)
  }
  return false
}

export function checkOverflow(
  messages: LLMMessage[],
  maxTokens: number,
  threshold = 0.8,
): boolean {
  return estimateTokens(messages) > maxTokens * threshold
}
