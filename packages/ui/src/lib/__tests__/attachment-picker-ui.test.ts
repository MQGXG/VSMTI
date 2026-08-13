import { describe, it, expect } from "vitest"
import { buildSendContent } from "../attachment-picker-ui"
import type { PendingAttachment } from "../file-parser"

describe("buildSendContent", () => {
  it("分离图片为 images 数组", () => {
    const atts: PendingAttachment[] = [
      { kind: "image", name: "a.png", size: 100, data: "data:image/png;base64,AAA" },
      { kind: "image", name: "b.png", size: 200, data: "data:image/png;base64,BBB" },
    ]
    const result = buildSendContent(atts, "看看这些图")
    expect(result.images).toEqual(["data:image/png;base64,AAA", "data:image/png;base64,BBB"])
    expect(result.rejected).toHaveLength(0)
  })

  it("PDF 作为图片发送（视觉桥）", () => {
    const atts: PendingAttachment[] = [
      { kind: "pdf", name: "doc.pdf", size: 500, data: "data:application/pdf;base64,PDF" },
    ]
    const result = buildSendContent(atts, "")
    expect(result.images).toEqual(["data:application/pdf;base64,PDF"])
  })

  it("文本/Excel/Word 内容拼接为文本", () => {
    const atts: PendingAttachment[] = [
      { kind: "text", name: "note.md", size: 50, data: "hello world", format: "markdown" },
      { kind: "excel", name: "data.xlsx", size: 300, data: "| A | B |", format: "csv" },
    ]
    const result = buildSendContent(atts, "分析文件")
    expect(result.text).toContain("note.md")
    expect(result.text).toContain("hello world")
    expect(result.text).toContain("data.xlsx")
    expect(result.text).toContain("| A | B |")
    expect(result.images).toHaveLength(0)
  })

  it("不支持/解析失败的文件进入 rejected", () => {
    const atts: PendingAttachment[] = [
      { kind: "unknown", name: "x.zip", size: 10, data: "", error: "该文件类型暂不支持解析" },
      { kind: "word", name: "broken.docx", size: 20, data: "", error: "文档解析失败" },
    ]
    const result = buildSendContent(atts, "hi")
    expect(result.rejected).toHaveLength(2)
    expect(result.images).toHaveLength(0)
  })

  it("无文本且无图片时返回默认提示", () => {
    const atts: PendingAttachment[] = []
    const result = buildSendContent(atts, "")
    expect(result.text).toBe("请查看以下内容：")
  })
})
