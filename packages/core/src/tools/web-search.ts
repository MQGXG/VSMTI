import { z } from "zod"
import { make } from "../tool"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

interface SearchResult {
  title: string
  url: string
  content: string
  source: string
}

async function tryFetch(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!resp.ok) return null
    return await resp.text()
  } catch { return null }
}

/** DuckDuckGo HTML 搜索 — 最稳定，不需要 API Key */
async function ddg(query: string, max: number): Promise<SearchResult[] | null> {
  const html = await tryFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)
  if (!html) return null

  const results: SearchResult[] = []
  const linkRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  const snippets: string[] = []

  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null && results.length < max) {
    const href = decodeURIComponent(m[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0])
    const title = m[2].replace(/<[^>]+>/g, "").trim()
    if (title && href.startsWith("http")) results.push({ title, url: href, content: "", source: "duckduckgo" })
  }
  while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, "").trim())
  snippets.forEach((s, i) => { if (results[i]) results[i].content = s })
  return results.length > 0 ? results : null
}

/** SEArxNG 公共实例（JSON API，可配置） */
async function searxng(query: string, max: number, instance?: string): Promise<SearchResult[] | null> {
  const instances = instance
    ? [instance]
    : ["https://search.sapti.me", "https://searx.be", "https://searx.work"]
  for (const base of instances) {
    try {
      const resp = await fetch(`${base}/search?q=${encodeURIComponent(query)}&format=json`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      })
      if (!resp.ok) continue
      const data = await resp.json()
      const items = (data.results || []).slice(0, max).filter((r: any) => r.title && r.url)
      if (items.length > 0) return items.map((r: any) => ({
        title: r.title,
        url: r.url,
        content: (r.content || "").slice(0, 500),
        source: `searxng`,
      }))
    } catch { continue }
  }
  return null
}

export const webSearchTool = make({
  name: "web_search",
  description: "Search the web for current information. Uses DuckDuckGo with SEArxNG fallback. Use when: needing current information, looking for documentation, finding solutions to problems, researching topics.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().optional().default(5).describe("Max results (max 10)"),
    searxInstance: z.string().optional().describe("Custom SEArxNG instance URL (e.g. https://searx.example.com)"),
  }),
  outputSchema: z.string(),
  permission: "web_search",
  async execute(input, _ctx) {
    const max = Math.min(input.maxResults || 5, 10)

    // 1) DuckDuckGo
    const ddgResults = await ddg(input.query, max)
    if (ddgResults) {
      return {
        success: true,
        output: [
          `来源: DuckDuckGo`,
          `查询: ${input.query}`,
          `结果: ${ddgResults.length}`,
          "─".repeat(40),
          ...ddgResults.map((r, i) =>
            `${i + 1}. [${r.title}](${r.url})\n   ${r.content.slice(0, 300)}`),
        ].join("\n"),
      }
    }

    // 2) SEArxNG 降级
    const sxResults = await searxng(input.query, max, input.searxInstance)
    if (sxResults) {
      return {
        success: true,
        output: [
          `来源: SEArxNG`,
          `查询: ${input.query}`,
          `结果: ${sxResults.length}`,
          "─".repeat(40),
          ...sxResults.map((r, i) =>
            `${i + 1}. [${r.title}](${r.url})\n   ${r.content.slice(0, 300)}`),
        ].join("\n"),
      }
    }

    // 3) 全部失败
    return {
      success: false,
      error: [
        "搜索失败：所有搜索引擎均不可用。",
        "  - DuckDuckGo: 被屏蔽或超时",
        "  - SEArxNG: 所有公共实例无响应",
        "",
        "解决方法:",
        "  1. 稍后重试（搜索引擎可能有临时限制）",
        "  2. 使用 web_browse 直接访问目标网站",
        "  3. 自建 SEArxNG 实例并通过 searxInstance 参数指定",
      ].join("\n"),
    }
  },
})
