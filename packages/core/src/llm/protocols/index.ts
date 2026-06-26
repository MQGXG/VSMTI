export { serializeMessages, deserializeChunk, getFinishReason, OpenAIChatProtocol } from "./openai-chat"
export { serializeMessages as serializeAnthropicMessages, serializeSystem, deserializeStreamEvent, AnthropicMessagesProtocol } from "./anthropic-messages"
export { createCompatibleBody, OpenAICompatibleChatProtocol } from "./openai-compatible-chat"
