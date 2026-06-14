/**
 * 浏览器自动化工具 — 使用 Playwright 操控网页
 * 替代 Python playwright
 */

import { z } from "zod"
import { make } from "../tool"
import { BrowserContext, Page } from "playwright"

let browserContext: BrowserContext | null = null

const navigationState = {
  currentUrl: "",
  history: [] as string[],
  historyIndex: -1,
}

async function getContext(): Promise<BrowserContext> {
  if (!browserContext) {
    const { chromium } = await import("playwright")
    const browser = await chromium.launch({ headless: true })
    browserContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })
  }
  return browserContext
}

function getOrCreatePage(context: BrowserContext): Promise<Page> {
  if (context.pages().length > 0) return Promise.resolve(context.pages()[0])
  return context.newPage()
}

export const webBrowseTool = make({
  name: "web_browse",
  description: "在浏览器中打开网页并提取内容。支持导航、截图、点击、滚动、返回",
  inputSchema: z.object({
    action: z.enum(["navigate", "snapshot", "click", "type", "scroll", "back", "extract"]).describe("操作类型"),
    url: z.string().optional().describe("导航/navigate 时必需的目标 URL"),
    selector: z.string().optional().describe("click/type 时必需的元素选择器"),
    text: z.string().optional().describe("type 时输入的文本"),
    direction: z.enum(["up", "down"]).optional().default("down").describe("滚动方向"),
    amount: z.number().optional().default(500).describe("滚动像素数"),
  }),
  outputSchema: z.string(),
  execute: async (input) => {
    try {
      const ctx = await getContext()
      const page = await getOrCreatePage(ctx)

      if (input.action === "navigate") {
        if (!input.url) return { success: false, error: "navigate 需要 url 参数" }
        await page.goto(input.url, { waitUntil: "networkidle", timeout: 30000 })
        navigationState.currentUrl = page.url()
        navigationState.history.push(navigationState.currentUrl)
        navigationState.historyIndex = navigationState.history.length - 1
        const title = await page.title()
        const text = (await page.innerText("body")).slice(0, 3000)
        return { success: true, output: `**${title}**\n\n${text}\n\n---\nURL: ${page.url()}` }
      }

      if (input.action === "snapshot") {
        const title = await page.title()
        const text = (await page.innerText("body")).slice(0, 4000)
        return { success: true, output: `**${title}**\n\n${text}\n\n---\nURL: ${page.url()}` }
      }

      if (input.action === "click") {
        if (!input.selector) return { success: false, error: "click 需要 selector 参数" }
        await page.click(input.selector, { timeout: 5000 })
        await page.waitForTimeout(1000)
        const text = (await page.innerText("body")).slice(0, 3000)
        return { success: true, output: `已点击 ${input.selector}\n\n${text}` }
      }

      if (input.action === "type") {
        if (!input.selector) return { success: false, error: "type 需要 selector 参数" }
        await page.fill(input.selector, input.text || "")
        return { success: true, output: `已在 ${input.selector} 输入文本` }
      }

      if (input.action === "scroll") {
        await page.evaluate(({ direction, amount }) => {
          window.scrollBy(0, direction === "down" ? amount : -amount)
        }, { direction: input.direction || "down", amount: input.amount || 500 })
        await page.waitForTimeout(500)
        const text = (await page.innerText("body")).slice(0, 2000)
        return { success: true, output: `已${input.direction === "down" ? "向下" : "向上"}滚动\n\n${text}` }
      }

      if (input.action === "back") {
        if (navigationState.historyIndex > 0) {
          navigationState.historyIndex--
          await page.goBack({ waitUntil: "networkidle", timeout: 30000 })
        }
        const text = (await page.innerText("body")).slice(0, 3000)
        return { success: true, output: `已返回上一页\n\n${text}` }
      }

      if (input.action === "extract") {
        const text = (await page.innerText("body")).slice(0, 5000)
        const links = await page.$$eval("a[href]", (els) =>
          els.slice(0, 20).map((a) => ({ text: a.textContent?.trim() || "", href: (a as HTMLAnchorElement).href }))
        )
        const linkText = links.map((l) => `- [${l.text}](${l.href})`).join("\n")
        return { success: true, output: `${text}\n\n**链接:**\n${linkText}` }
      }

      return { success: false, error: `未知操作: ${input.action}` }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
})
