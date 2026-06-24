/**
 * Web Fetch 工具 — 轻量级网页内容获取
 * 参考 MiMo Code 的 webfetch.ts
 *
 * 核心能力：
 * 1. HTTP GET 获取网页内容
 * 2. HTML → Markdown 转换（Turndown）
 * 3. Cloudflare 检测 + UA 重试
 * 4. 图片附件支持
 * 5. 5MB 大小限制 + 超时控制
 */

import { z } from "zod"
import { make } from "../tool"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const MAX_TIMEOUT = 120 * 1000 // 2 minutes

const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
const UA_BOT = "MiraCode/1.0"

function extractTextFromHTML(html: string): string {
  // 简易 HTML → 文本提取（移除 script/style/meta）
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<meta[\s\S]*?>/gi, "")
    .replace(/<link[\s\S]*?>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text
}

function convertHTMLToMarkdown(html: string): string {
  // 简易 HTML → Markdown 转换
  let md = html
    // 移除 script/style
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // 标题
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "#### $1\n\n")
    // 粗体/斜体
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*")
    // 链接
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    // 代码块
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "```\n$1\n```\n\n")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    // 列表
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    // 段落/换行
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n")
    // 移除剩余标签
    .replace(/<[^>]+>/g, "")
    // HTML 实体
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // 清理多余空行
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return md
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<{ ok: boolean; status: number; statusText: string; headers: Record<string, string>; body: string; isCloudflare: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    })

    clearTimeout(timer)

    const headers: Record<string, string> = {}
    resp.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })

    const contentLength = headers["content-length"]
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      return { ok: false, status: 413, statusText: "Response Too Large", headers, body: "", isCloudflare: false }
    }

    const body = await resp.text()
    if (body.length > MAX_RESPONSE_SIZE) {
      return { ok: false, status: 413, statusText: "Response Too Large", headers, body: "", isCloudflare: false }
    }

    // Cloudflare 检测
    const isCloudflare = resp.status === 403 &&
      (headers["cf-mitigated"] === "challenge" || body.includes("cf-browser-verification"))

    return { ok: resp.ok, status: resp.status, statusText: resp.statusText, headers, body, isCloudflare }
  } catch (e: any) {
    clearTimeout(timer)
    if (e.name === "AbortError") {
      return { ok: false, status: 408, statusText: "Request Timeout", headers: {}, body: "", isCloudflare: false }
    }
    throw e
  }
}

export const webFetchTool = make({
  name: "web_fetch",
  description: "Fetch and read content from a specific URL. Returns markdown, text, or HTML. Use when: reading documentation pages, fetching article content, accessing GitHub pages or READMEs, getting API documentation.",
  inputSchema: z.object({
    url: z.string().url().describe("URL to fetch (must start with http:// or https://)"),
    format: z.enum(["markdown", "text", "html"]).optional().default("markdown")
      .describe("Output format: markdown (default), text, or raw html"),
    timeout: z.number().optional().default(30)
      .describe("Timeout in seconds (max 120)"),
  }),
  outputSchema: z.string(),
  permission: "web_search",

  async execute(input, _ctx) {
    const url = input.url
    const format = input.format || "markdown"
    const timeoutMs = Math.min((input.timeout || 30) * 1000, MAX_TIMEOUT)

    // 第一次尝试：桌面 UA
    let result = await fetchWithTimeout(url, timeoutMs, UA_DESKTOP)

    // Cloudflare 检测 → 用 Bot UA 重试
    if (result.isCloudflare) {
      result = await fetchWithTimeout(url, timeoutMs, UA_BOT)
    }

    if (!result.ok && !result.body) {
      const errorMsg = result.status === 408
        ? `Request timed out after ${input.timeout || 30}s`
        : result.status === 413
          ? "Response too large (exceeds 5MB limit)"
          : `HTTP ${result.status}: ${result.statusText || "Request failed"}`
      return { success: false, error: `${errorMsg}\nURL: ${url}` }
    }

    const contentType = result.headers["content-type"] || ""
    const mime = contentType.split(";")[0]?.trim().toLowerCase() || ""

    // 图片处理
    if (mime.startsWith("image/")) {
      const base64 = Buffer.from(result.body, "binary").toString("base64")
      return {
        success: true,
        output: `Image fetched: ${url} (${mime})`,
        metadata: {
          mime,
          data: base64,
          name: url.split("/").pop() || "image",
        },
      }
    }

    // 内容转换
    let output: string
    const isHTML = contentType.includes("text/html") || contentType.includes("application/xhtml")

    switch (format) {
      case "markdown":
        output = isHTML ? convertHTMLToMarkdown(result.body) : result.body
        break
      case "text":
        output = isHTML ? extractTextFromHTML(result.body) : result.body
        break
      case "html":
        output = result.body
        break
      default:
        output = isHTML ? convertHTMLToMarkdown(result.body) : result.body
    }

    // 截断过长内容
    const MAX_OUTPUT = 50000
    if (output.length > MAX_OUTPUT) {
      output = output.slice(0, MAX_OUTPUT) + `\n\n[Content truncated at ${MAX_OUTPUT} chars]`
    }

    return {
      success: true,
      output: output || "(empty response)",
      metadata: {
        url,
        contentType: mime,
        format,
        size: result.body.length,
      },
    }
  },
})
