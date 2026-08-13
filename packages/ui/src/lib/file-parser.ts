/**
 * 附件分类解析 — 把用户选择的文件转为可发送内容
 *
 * 分类：
 * - image  → base64（已压缩）→ 视觉链路
 * - text   → 文本内容（txt/md/csv/代码）
 * - excel  → CSV/HTML 表格文本
 * - word   → Markdown/HTML（含表格/图片）
 * - ppt    → Markdown/HTML
 * - pdf    → base64 原样（走视觉桥，零依赖）
 * - unknown→ 拒绝（不发送）
 */

import { compressImage } from "./image-compress";
import { parseOfficeFile } from "./ooxml";
import { excelToContent } from "./excel";

export interface PendingAttachment {
  kind: "image" | "text" | "excel" | "word" | "ppt" | "pdf" | "unknown";
  name: string;
  size: number;
  /** 图片/pdf：data URL；文本类：解析后的内容 */
  data: string;
  /** 解析结果的渲染格式（text 类可用） */
  format?: "html" | "markdown" | "csv";
  /** 拒绝原因 */
  error?: string;
  /** 文档内嵌图片（word/ppt 解析时提取） */
  images?: Record<string, string>;
}

export const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "log", "csv", "tsv",
  "json", "jsonl", "xml", "yaml", "yml", "toml", "ini", "conf",
  "js", "ts", "tsx", "jsx", "py", "rb", "rs", "go", "java", "c", "cpp",
  "h", "hpp", "css", "scss", "sass", "html", "htm", "sh", "bash", "zsh",
  "sql", "gql", "graphql", "env", "properties",
]);

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

const TEXT_READ_LIMIT = 1024 * 1024; // 文本读取上限 1MB

/**
 * 解析文件为可发送附件。
 * @param file 用户选择的文件
 * @param readAsText 读取文本文件的函数（默认 file.text()）
 */
export async function parseFile(
  file: File,
  readAsText?: (file: File) => Promise<string>,
): Promise<PendingAttachment> {
  const ext = extOf(file.name);

  // 图片：读取 base64 + canvas 压缩
  if (IMAGE_EXTENSIONS.has(ext) || file.type.startsWith("image/")) {
    const dataUrl = await fileToDataUrl(file);
    let data = dataUrl;
    try {
      data = await compressImage(dataUrl);
    } catch { /* 压缩失败用原图 */ }
    return { kind: "image", name: file.name, size: file.size, data };
  }

  // PDF：base64 原样（走视觉桥）
  if (ext === "pdf" || file.type === "application/pdf") {
    const dataUrl = await fileToDataUrl(file);
    return { kind: "pdf", name: file.name, size: file.size, data: dataUrl };
  }

  // Excel
  if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) {
    try {
      const buffer = await file.arrayBuffer();
      const result = await excelToContent(buffer);
      return { kind: "excel", name: file.name, size: file.size, data: result.content, format: result.format };
    } catch {
      return { kind: "excel", name: file.name, size: file.size, data: "", error: "Excel 解析失败" };
    }
  }

  // Word / PPT
  if (ext === "docx" || ext === "pptx") {
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseOfficeFile(file.name, buffer);
      if (result) {
        return {
          kind: ext === "docx" ? "word" : "ppt",
          name: file.name, size: file.size,
          data: result.content, format: result.format,
          images: Object.keys(result.images).length > 0 ? result.images : undefined,
        };
      }
      return { kind: ext === "docx" ? "word" : "ppt", name: file.name, size: file.size, data: "", error: "文档解析失败" };
    } catch {
      return { kind: ext === "docx" ? "word" : "ppt", name: file.name, size: file.size, data: "", error: "文档解析失败" };
    }
  }

  // 文本类
  if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith("text/")) {
    try {
      const reader = readAsText || ((f) => f.text());
      let text = await reader(file);
      if (text.length > TEXT_READ_LIMIT) {
        text = text.slice(0, TEXT_READ_LIMIT) + `\n... (文件过大，已截断至 ${Math.round(TEXT_READ_LIMIT / 1024)}KB)`;
      }
      return { kind: "text", name: file.name, size: file.size, data: text, format: "markdown" };
    } catch {
      return { kind: "text", name: file.name, size: file.size, data: "", error: "文本读取失败" };
    }
  }

  // 不支持的格式
  return { kind: "unknown", name: file.name, size: file.size, data: "", error: "该文件类型暂不支持解析" };
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ? new Error(reader.error.message) : new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}
