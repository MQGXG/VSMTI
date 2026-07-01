import type { AttachmentAdapter } from "@assistant-ui/react";

export const fileAttachmentAdapter: AttachmentAdapter = {
  accept: "*/*",
  async add({ file }) {
    const text = await file.text();
    return {
      id: crypto.randomUUID(),
      type: file.type.startsWith("image/") ? "image" : "document",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
      text,
    };
  },
  async send(attachment) {
    return {
      ...attachment,
      status: { type: "complete" },
      content: attachment.type === "image" && attachment.file
        ? [{ type: "image" as const, image: URL.createObjectURL(attachment.file) }]
        : [{ type: "text" as const, text: (attachment as any).text || `[附件: ${attachment.name}]` }],
    };
  },
};
