import { z } from "zod"

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly provider?: string,
  ) {
    super(message)
    this.name = "LLMError"
  }

  static provider(provider: string, message: string, statusCode?: number): LLMError {
    return new LLMError(message, "PROVIDER_ERROR", statusCode, provider)
  }

  static auth(provider: string): LLMError {
    return new LLMError(`Authentication failed for ${provider}`, "AUTH_ERROR", 401, provider)
  }

  static rateLimit(provider: string, retryAfter?: number): LLMError {
    return new LLMError(`Rate limited by ${provider}`, "RATE_LIMIT", 429, provider)
  }

  static timeout(provider: string): LLMError {
    return new LLMError(`Request timed out for ${provider}`, "TIMEOUT", undefined, provider)
  }

  static invalidRequest(message: string): LLMError {
    return new LLMError(message, "INVALID_REQUEST")
  }
}
