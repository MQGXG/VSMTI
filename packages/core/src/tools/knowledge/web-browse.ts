import { z } from "zod"
import { make } from "../../shared/tool"
import type { BrowserContext, Page } from "playwright"

let browserContext: BrowserContext | null = null
let launchAttempted = false
let launchError = ""

const navigationState = {
  currentUrl: "",
  history: [] as string[],
  historyIndex: -1,
}

async function getContext(): Promise<BrowserContext> {
  if (browserContext) return browserContext
  if (launchAttempted) throw new Error(launchError || "浏览器启动失败，请检查 Playwright 安装")
  launchAttempted = true

  try {
    const { chromium } = await import("playwright")
    const browser = await chromium.launch({ headless: true, timeout: 15000 })
    browserContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    })
    return browserContext
  } catch (e: any) {
    launchError = e.message || String(e)
    if (launchError.includes("Cannot find module") || launchError.includes("playwright")) {
      launchError = "Playwright 未安装。请运行: npx playwright install chromium"
    } else if (launchError.includes("Executable doesn't exist") || launchError.includes("chromium")) {
      launchError = "Chromium 浏览器未下载。请运行: npx playwright install chromium"
    }
    throw new Error(launchError)
  }
}

async function pageText(page: Page, maxLen = 4000): Promise<string> {
  try {
    return (await page.innerText("body")).slice(0, maxLen)
  } catch {
    return "(无法提取页面内容)"
  }
}

export const webBrowseTool = make({
  name: "web_browse",
  description: "Open a web page and extract content. Supports navigation, snapshot, click, type, scroll, back. Requires Playwright (npx playwright install chromium).",
  inputSchema: z.object({
    action: z.enum(["navigate", "snapshot", "click", "type", "scroll", "back", "extract"]).describe("操作"),
    url: z.string().optional().describe("navigate 时所需 URL"),
    selector: z.string().optional().describe("click/type 时所需 CSS 选择器"),
    text: z.string().optional().describe("type 时输入的文本"),
    direction: z.enum(["up", "down"]).optional().default("down"),
    amount: z.number().optional().default(500),
  }),
  outputSchema: z.string(),
  permission: "web_search",
  execute: async (input) => {
    let ctx: BrowserContext
    try {
      ctx = await getContext()
    } catch (e: any) {
      return { success: false, error: `浏览器启动失败: ${e.message}\n请确保已安装 Playwright: npx playwright install chromium` }
    }

    const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage()

    try {
      switch (input.action) {
        case "navigate": {
          if (!input.url) return { success: false, error: "navigate 需要 url 参数" }
          await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30000 })
          navigationState.currentUrl = page.url()
          navigationState.history.push(navigationState.currentUrl)
          navigationState.historyIndex = navigationState.history.length - 1
          const title = await page.title()
          const text = await pageText(page, 3000)
          return { success: true, output: `**${title}**\n\n${text}\n\nURL: ${page.url()}` }
        }

        case "snapshot": {
          const title = await page.title()
          const text = await pageText(page, 4000)
          return { success: true, output: `**${title}**\n\n${text}\n\nURL: ${page.url()}` }
        }

        case "click": {
          if (!input.selector) return { success: false, error: "click 需要 selector 参数" }
          await page.click(input.selector, { timeout: 5000 })
          await page.waitForTimeout(1000)
          const text = await pageText(page, 3000)
          return { success: true, output: `已点击 ${input.selector}\n\n${text}` }
        }

        case "type": {
          if (!input.selector) return { success: false, error: "type 需要 selector 参数" }
          await page.fill(input.selector, input.text || "")
          return { success: true, output: `已在 ${input.selector} 输入文本` }
        }

        case "scroll": {
          await page.evaluate(({ d, a }) => window.scrollBy(0, d === "down" ? a : -a), { d: input.direction || "down", a: input.amount || 500 })
          await page.waitForTimeout(500)
          const text = await pageText(page, 2000)
          return { success: true, output: `已${input.direction === "down" ? "向下" : "向上"}滚动\n\n${text}` }
        }

        case "back": {
          if (navigationState.historyIndex > 0) {
            navigationState.historyIndex--
            await page.goBack({ waitUntil: "domcontentloaded", timeout: 30000 })
          }
          const text = await pageText(page, 3000)
          return { success: true, output: `已返回上一页\n\n${text}` }
        }

        case "extract": {
          const text = await pageText(page, 5000)
          const links = await page.$$eval("a[href]", (els) =>
            els.slice(0, 20).map((a) => ({ text: a.textContent?.trim() || "", href: (a as HTMLAnchorElement).href }))
          )
          return { success: true, output: `${text}\n\n**链接:**\n${links.map((l) => `- [${l.text}](${l.href})`).join("\n")}` }
        }

        default:
          return { success: false, error: `未知操作: ${input.action}` }
      }
    } catch (e: any) {
      return { success: false, error: `操作失败: ${e.message.slice(0, 200)}` }
    }
  },
})

