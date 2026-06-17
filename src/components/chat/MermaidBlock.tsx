import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    background: "#0D1117",
    primaryColor: "#1A2E35",
    primaryTextColor: "#E8F4F0",
    primaryBorderColor: "#2A4A50",
    lineColor: "#5C8D8A",
    secondaryColor: "#0F1A20",
    tertiaryColor: "#15252A",
    fontSize: "14px",
  },
  flowchart: { useMaxWidth: true, htmlLabels: true },
  sequence: { useMaxWidth: true },
  gantt: { useMaxWidth: true },
});

interface Props {
  code: string;
}

export function MermaidBlock({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${crypto.randomUUID().slice(0, 8)}`;

    async function render() {
      try {
        setLoading(true);
        setError(null);
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "渲染失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="my-4 rounded-xl overflow-hidden" style={{ background: '#0D1117', border: '1px solid #1A2E35' }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#0F1A20', borderBottom: '1px solid #1A2E35' }}>
          <span className="text-[11px] font-mono font-medium" style={{ color: '#5C8D8A' }}>mermaid</span>
        </div>
        <div className="p-4 text-xs text-red-400 whitespace-pre-wrap font-mono">{error}</div>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl overflow-hidden" style={{ background: '#0D1117', border: '1px solid #1A2E35' }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#0F1A20', borderBottom: '1px solid #1A2E35' }}>
        <span className="text-[11px] font-mono font-medium" style={{ color: '#5C8D8A' }}>mermaid</span>
      </div>
      <div ref={containerRef} className="p-4 flex justify-center overflow-x-auto">
        {loading && <span className="text-xs text-neutral-500">渲染中...</span>}
      </div>
    </div>
  );
}
