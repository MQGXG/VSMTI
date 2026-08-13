/**
 * 附件选择 UI 辅助 — 主进程 dialog 选择 + 拖拽文件读取
 *
 * 文件读取走主进程（token 授权），渲染进程不直接访问文件系统。
 */

import { DialogService } from "../services/dialog.service";
import { parseFile, type PendingAttachment } from "./file-parser";

/** 通过主进程 dialog 选择文件并解析 */
export async function pickAndParseFiles(): Promise<PendingAttachment[]> {
  const result = await DialogService.openFile();
  if (!result || result.token === "" || result.files.length === 0) {
    if (result?.error) throw new Error(result.error);
    return [];
  }
  try {
    const attachments: PendingAttachment[] = [];
    for (const fileMeta of result.files) {
      const bytes = await DialogService.readPickedFile(result.token, fileMeta.path);
      const file = new File([bytes], fileMeta.name);
      const attachment = await parseFile(file);
      attachment.size = fileMeta.size;
      attachments.push(attachment);
    }
    return attachments;
  } finally {
    await DialogService.releasePickedFiles(result.token).catch(() => {});
  }
}

/** 拖拽文件解析（浏览器 File 对象） */
export async function parseDroppedFiles(files: File[]): Promise<PendingAttachment[]> {
  const attachments: PendingAttachment[] = [];
  for (const file of files) {
    const attachment = await parseFile(file);
    attachments.push(attachment);
  }
  return attachments;
}

/** 把解析后的附件转换为发送内容（文本拼接 + 图片列表分离） */
export function buildSendContent(
  attachments: PendingAttachment[],
  userText: string,
): { text: string; images: string[]; rejected: PendingAttachment[] } {
  const images: string[] = [];
  const textParts: string[] = [];
  const rejected: PendingAttachment[] = [];

  for (const att of attachments) {
    if (att.kind === "image") {
      images.push(att.data);
      continue;
    }
    if (att.kind === "pdf") {
      // PDF 走视觉桥：作为图片发送（模型视觉能力处理）
      images.push(att.data);
      continue;
    }
    if (att.kind === "unknown" || att.error) {
      rejected.push(att);
      continue;
    }
    if (att.data) {
      textParts.push(`### ${att.name}\n\n${att.data}`);
    }
  }

  const joined = [userText, ...textParts].filter(Boolean).join("\n\n");
  return { text: joined || "请查看以下内容：", images, rejected };
}
