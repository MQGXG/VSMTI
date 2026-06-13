import { z } from "zod"
import { make } from "../tool"

export const webSearchTool = make({
  name: "web_search",
  description: "Search the internet for current information using DuckDuckGo.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().optional().default(5).describe("Maximum results to return"),
  }),
  outputSchema: z.string(),
  permission: "web_search",
  async execute(input, _ctx) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OmniAgent/1.0)" },
      signal: AbortSignal.timeout(10000),
    })
    const html = await resp.text()
    const results: string[] = []
    const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    let match: RegExpExecArray | null
    let idx = 0
    while ((match = linkRegex.exec(html)) !== null && idx < input.maxResults!) {
      const href = decodeURIComponent(match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, ""))
      const title = match[2].replace(/<[^>]+>/g, "").trim()
      results.push(`[${title}](${href})`)
      idx++
    }
    idx = 0
    while ((match = snippetRegex.exec(html)) !== null && idx < input.maxResults!) {
      const snippet = match[1].replace(/<[^>]+>/g, "").trim()
      if (results[idx]) results[idx] += `\n${snippet}`
      idx++
    }
    if (results.length === 0) return { success: true, output: `No results found for "${input.query}"` }
    return { success: true, output: results.join("\n\n") }
  },
})
