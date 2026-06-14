import { z } from "zod"
import { make } from "../tool"

/** DuckDuckGo HTML 搜索（降级方案） */
async function searchDuckDuckGo(query: string): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    signal: AbortSignal.timeout(8000),
  })
  const html = await resp.text()
  const results: string[] = []
  const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  let match: RegExpExecArray | null
  while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
    const href = decodeURIComponent(match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0])
    const title = match[2].replace(/<[^>]+>/g, "").trim()
    if (title) results.push(`[${title}](${href})`)
  }
  let si = 0
  while ((match = snippetRegex.exec(html)) !== null && si < results.length) {
    const snippet = match[1].replace(/<[^>]+>/g, "").trim()
    if (snippet) results[si] += `\n> ${snippet}`
    si++
  }
  return results.join("\n\n")
}

export const webSearchTool = make({
  name: "web_search",
  description: "Search the internet for current information. Use for news, facts, and web content.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().optional().default(5).describe("Maximum results to return"),
  }),
  outputSchema: z.string(),
  permission: "web_search",
  async execute(input, _ctx) {
    const maxResults = Math.min(input.maxResults || 5, 10)
    let lastError = ""

    // 尝试 DuckDuckGo
    try {
      const result = await searchDuckDuckGo(input.query)
      if (result) return { success: true, output: result }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }

    // 备用：SEArxNG 公共实例
    const searxInstances = ["https://search.sapti.me", "https://searx.be"]
    for (const instance of searxInstances) {
      try {
        const resp = await fetch(`${instance}/search?q=${encodeURIComponent(input.query)}&format=json`, {
          signal: AbortSignal.timeout(8000),
        })
        if (!resp.ok) continue
        const data = await resp.json()
        const results = (data.results || []).slice(0, maxResults).map((r: any) =>
          `[${r.title}](${r.url})\n> ${(r.content || "").slice(0, 300)}`
        )
        if (results.length > 0) return { success: true, output: results.join("\n\n") }
      } catch { continue }
    }

    return { success: false, error: `搜索失败: ${lastError}. 可尝试使用 web_browse 直接访问网站` }
  },
})
