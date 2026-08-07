"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { extractWidgetBlocks, prepareWidgetHtml } from "./widget-utils";

// 本地库源码（?raw 导入 → iframe 内联注入，离线可用、符合 CSP）
// Chart.js 是 UMD 格式，可内联 <script>；mermaid 是 ESM，改由 UI 端 mermaid 插件渲染（```mermaid 块）
// 用相对路径绕过 chart.js package exports 限制（Vite ?raw 走文件系统）
import chartJsSrc from "../../../../../node_modules/chart.js/dist/chart.umd.min.js?raw";

/** 需要注入到 iframe 的本地库（脚本片段，按名字注册为全局变量） */
const INJECTABLE_LIBS: Record<string, string> = {
  "chart.js": chartJsSrc,
  chart: chartJsSrc,
  chart_umd: chartJsSrc,
  "chart.umd": chartJsSrc,
};

/**
 * 可视化渲染容器 — iframe 沙箱
 * 承载 LLM 生成的富 HTML/SVG/JS（widget_code），本地注入图表库。
 * - sandbox="allow-scripts"：允许脚本执行，但隔离 DOM/导航/弹窗
 * - 本地注入 mermaid/chart.js：离线可用、符合现有 CSP
 * - 高度自适应：iframe 内 postMessage 高度，外层 ResizeObserver
 */
function WidgetRendererImpl({ html, className = "" }: { html: string; className?: string }) {
  const [height, setHeight] = useState(360);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 预处理 HTML（CDN → 本地注入）
  const preparedHtml = useMemo(() => prepareWidgetHtml(html, INJECTABLE_LIBS).processed, [html]);

  // 构造 iframe srcDoc
  const srcDoc = useMemo(() => {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 12px; }
  /* 高度上报脚本：渲染完成后把内容高度通知父窗口 */
</style>
</head>
<body>
${preparedHtml}
<script>
  function reportHeight() {
    var h = document.body.scrollHeight;
    window.parent.postMessage({ type: 'mira-widget-height', height: h }, '*');
  }
  window.addEventListener('load', function() { setTimeout(reportHeight, 100); });
  // 监听 DOM 变化（mermaid 异步渲染完成后触发）
  var mo = new MutationObserver(function() { setTimeout(reportHeight, 50); });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true });
  window.addEventListener('message', function(e) {
    if (e.data === 'mira-widget-request-height') reportHeight();
  });
</script>
</body>
</html>`;
  }, [preparedHtml]);

  // 监听 iframe 高度消息
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "mira-widget-height" && typeof e.data.height === "number") {
        const h = Math.min(Math.max(e.data.height, 100), 1200);
        setHeight(h);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // 高度变化时主动请求（配合 MutationObserver 的初始触发）
  useEffect(() => {
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage("mira-widget-request-height", "*");
    }, 200);
    return () => clearTimeout(t);
  }, [preparedHtml]);

  return (
    <div
      className={`mira-widget overflow-hidden rounded-xl border border-[var(--border)] ${className}`}
      style={{ height, transition: "height 0.15s ease", background: "#fff" }}
    >
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        title="可视化组件"
        style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
      />
    </div>
  );
}

export const WidgetRenderer = memo(WidgetRendererImpl);
export { prepareWidgetHtml, extractWidgetBlocks } from "./widget-utils";
