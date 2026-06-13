/**
 * 轻量级工具路由 — 根据用户输入自动匹配工具
 * 不需要 LLM，基于关键词模式匹配
 */

interface RouteMatch {
  tool: string
  confidence: number  // 0-1
  extractArgs: (input: string) => Record<string, unknown>
}

const routes: RouteMatch[] = [
  {
    tool: "read_file",
    confidence: 0.9,
    extractArgs: (input) => {
      const match = input.match(/(?:read|open|查看|读取|打开|cat|show)\s+["'‘’]?([^"' ？?]+)["'’']?/i)
      return { path: match?.[1] || "" }
    },
  },
  {
    tool: "read_file",
    confidence: 0.7,
    extractArgs: (input) => {
      const match = input.match(/(?:\.\w+|\w+\.\w+)/)
      return { path: match?.[0] || "" }
    },
  },
  {
    tool: "web_search",
    confidence: 0.9,
    extractArgs: (input) => {
      const match = input.match(/(?:search|google|find|搜索|查找)\s+(.+)/i)
      return { query: match?.[1] || input }
    },
  },
  {
    tool: "web_search",
    confidence: 0.6,
    extractArgs: (input) => {
      // 疑问句且不像是文件操作
      if (/^(什么|谁|哪里|怎么|why|how|what|when|where|哪个|最新)/i.test(input.trim())) {
        return { query: input }
      }
      return { query: input }
    },
  },
  {
    tool: "grep",
    confidence: 0.9,
    extractArgs: (input) => {
      const match = input.match(/(?:find|search|grep|查找|搜索)\s+["'‘’]?([^"' ？?]+)["'’']?\s+(?:in|inside|within|在|里|中)\s+["'‘’]?([^"' ？?]+)["'’']?/i)
      return { pattern: match?.[1] || "", path: match?.[2] || "" }
    },
  },
  {
    tool: "glob",
    confidence: 0.8,
    extractArgs: (input) => {
      const match = input.match(/(?:find|查找|找)\s+(?:\w+\s+)*?((?:\*\*)?\/\*[\w.*-]*)/i)
      return { pattern: match?.[1] || "" }
    },
  },
  {
    tool: "list_files",
    confidence: 0.9,
    extractArgs: (input) => {
      const match = input.match(/(?:ls|list|dir|列出|查看)\s+(.+)/i)
      return { path: match?.[1] || "." }
    },
  },
  {
    tool: "list_files",
    confidence: 0.7,
    extractArgs: () => ({ path: "." }),
  },
  {
    tool: "bash",
    confidence: 0.9,
    extractArgs: (input) => {
      if (/^(?:run|execute|bash|运行|执行)\s+(.+)/i.test(input)) {
        return { command: RegExp.$1 }
      }
      return { command: input }
    },
  },
  {
    tool: "run_code",
    confidence: 0.9,
    extractArgs: (input) => {
      const match = input.match(/run\s+(?:python\s+)?code[：:]\s*([\s\S]+)/i)
      return { code: match?.[1] || "" }
    },
  },
  {
    tool: "edit_file",
    confidence: 0.7,
    extractArgs: (input) => {
      const pathMatch = input.match(/(?:edit|修改|替换|replace)\s+["'‘’]?([^"' ？?]+)["'’']?/i)
      return { path: pathMatch?.[1] || "" }
    },
  },
  {
    tool: "write_file",
    confidence: 0.8,
    extractArgs: (input) => {
      const match = input.match(/(?:write|create|写入|创建|保存)\s+["'‘’]?([^"' ？?]+)["'’']?/i)
      return { path: match?.[1] || "" }
    },
  },
]

export interface RouteResult {
  tool: string
  confidence: number
  args: Record<string, unknown>
}

export function route(input: string): RouteResult | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let best: RouteResult | null = null

  for (const route of routes) {
    const args = route.extractArgs(trimmed)
    // 检查是否提取到了关键参数
    const hasKeyArg = Object.values(args).some((v) => typeof v === "string" && v.length > 0)

    if (hasKeyArg && route.confidence > (best?.confidence || 0)) {
      best = { tool: route.tool, confidence: route.confidence, args }
    }
  }

  return best
}

/** 检查输入是否看起来像工具请求 */
export function isToolRequest(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false
  const indicators = [
    /^(?:read|open|show|cat|list|ls|dir|search|find|grep|run|execute|write|edit|replace|create)/i,
    /^(?:读取|查看|打开|列出|搜索|查找|运行|执行|写入|创建|修改|替换)/,
    /^\w+\.\w+/,
    /\.(?:py|ts|js|json|txt|md|css|html|yml|yaml|toml|env|gitignore)\b/,
  ]
  return indicators.some((re) => re.test(trimmed))
}
