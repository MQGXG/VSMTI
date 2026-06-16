import { z } from "zod"
import { make } from "../tool"

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

interface SearchResult {
  title: string
  url: string
  content: string
  source: string
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.text()
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

/** Google HTML 搜索（无需 API Key） */
async function searchGoogle(query: string, maxResults: number): Promise<SearchResult[]> {
  const html = await fetchText(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults}`)
  const results: SearchResult[] = []
  // Google 结果区域
  const blocks = html.match(/<div[^>]*class="[^"]*g[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?=<div|$)/g) || []
  for (const block of blocks) {
    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)
    const linkMatch = block.match(/<a[^>]*href="\/(?:url\?q=)?([^"&]+)[^"]*"[^>]*>/)
    const snippetMatch = block.match(/<div[^>]*class="[^"]*[VwiC3b|BNeawe][^"]*"[^>]*>([\s\S]*?)<\/div>/)
    if (titleMatch && linkMatch) {
      const url = decodeURIComponent(linkMatch[1])
      if (url.startsWith("http")) {
        results.push({
          title: titleMatch[1].replace(/<[^>]+>/g, "").trim(),
          url,
          content: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "",
          source: "google",
        })
      }
    }
  }
  return results.slice(0, maxResults)
}

/** DuckDuckGo HTML 搜索 */
async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)
  const results: SearchResult[] = []
  const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  const snippets: string[] = []

  let match: RegExpExecArray | null
  while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
    const href = decodeURIComponent(match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0])
    const title = match[2].replace(/<[^>]+>/g, "").trim()
    if (title && href.startsWith("http")) {
      results.push({ title, url: href, content: "", source: "duckduckgo" })
    }
  }
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]+>/g, "").trim())
  }
  snippets.forEach((s, i) => { if (results[i]) results[i].content = s })
  return results
}

/** SEArxNG JSON API */
async function searchSearxng(query: string, maxResults: number): Promise<SearchResult[]> {
  const instances = ["https://search.sapti.me", "https://searx.be"]
  for (const instance of instances) {
    try {
      const data = await fetchJson(`${instance}/search?q=${encodeURIComponent(query)}&format=json`)
      if (data.results?.length > 0) {
        return data.results.slice(0, maxResults).map((r: any) => ({
          title: r.title || "",
          url: r.url || "",
          content: (r.content || "").slice(0, 500),
          source: `searxng(${instance.replace("https://", "")})`,
        }))
      }
    } catch { continue }
  }
  return []
}

/** Bing HTML 搜索 */
async function searchBing(query: string, maxResults: number): Promise<SearchResult[]> {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`)
  const results: SearchResult[] = []
  const blocks = html.match(/<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<\/li>/g) || []
  for (const block of blocks) {
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/)
    const snippetMatch = block.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)
    if (titleMatch) {
      results.push({
        title: titleMatch[2].replace(/<[^>]+>/g, "").trim(),
        url: titleMatch[1],
        content: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "",
        source: "bing",
      })
    }
  }
  return results.slice(0, maxResults)
}

/** Brave Search（免费公共 API） */
async function searchBrave(query: string, maxResults: number): Promise<SearchResult[]> {
  const data = await fetchJson(`https://search.brave.com/api/search?q=${encodeURIComponent(query)}&count=${maxResults}`)
  return (data.web?.results || []).slice(0, maxResults).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    content: (r.description || "").slice(0, 500),
    source: "brave",
  }))
}

const ENGINES: Array<{ name: string; search: (q: string, n: number) => Promise<SearchResult[]> }> = [
  { name: "google", search: searchGoogle },
  { name: "duckduckgo", search: searchDuckDuckGo },
  { name: "bing", search: searchBing },
  { name: "brave", search: searchBrave },
  { name: "searxng", search: searchSearxng },
]

export const webSearchTool = make({
  name: "web_search",
  description: "Search the internet. Tries multiple engines (Google, DuckDuckGo, Bing, Brave, SEArxNG). Use for news, facts, and web content.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().optional().default(5).describe("Maximum results to return (max 10)"),
    engine: z.string().optional().describe("Specific search engine: google, duckduckgo, bing, brave, searxng, or auto (default)"),
  }),
  outputSchema: z.string(),
  permission: "web_search",
  async execute(input, _ctx) {
    const maxResults = Math.min(input.maxResults || 5, 10)
    const preferred = input.engine
    const ordered = preferred
      ? [ENGINES.find((e) => e.name === preferred)].filter(Boolean) as typeof ENGINES
      : ENGINES

    const errors: string[] = []
    for (const engine of ordered) {
      try {
        const results = await engine.search(input.query, maxResults)
        if (results.length > 0) {
          const header = `搜索引擎: ${engine.name}\n查询: ${input.query}\n结果: ${results.length}\n${"─".repeat(40)}`
          const body = results.map((r, i) =>
            `${i + 1}. [${r.title}](${r.url})\n   ${r.content.slice(0, 300)}`
          ).join("\n\n")
          return { success: true, output: `${header}\n\n${body}` }
        }
        errors.push(`${engine.name}: 无结果`)
      } catch (e) {
        errors.push(`${engine.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return { success: false, error: `所有搜索引擎均失败:\n${errors.join("\n")}\n\n可尝试 web_browse 直接访问网站` }
  },
})