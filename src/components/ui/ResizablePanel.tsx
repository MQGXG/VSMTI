import { useState, useRef, useCallback, useEffect, ReactNode } from "react";

interface Props {
  children: [ReactNode, ReactNode];
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

export function ResizablePanel({
  children,
  defaultWidth = 256,
  minWidth = 180,
  maxWidth = 400,
  storageKey,
}: Props) {
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= minWidth && n <= maxWidth) return n;
      }
    }
    return defaultWidth;
  });

  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (storageKey) {
        localStorage.setItem(storageKey, String(width));
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, width, minWidth, maxWidth, storageKey]);

  const [left, right] = children;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左侧面板 */}
      <div className="shrink-0 overflow-hidden" style={{ width }}>
        {left}
      </div>

      {/* 拖拽手柄 */}
      <div
        className="w-1 shrink-0 cursor-col-resize transition-colors duration-150"
        style={{
          background: isDragging ? 'var(--accent)' : 'var(--border)',
        }}
        onMouseDown={handleMouseDown}
      />

      {/* 右侧内容 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {right}
      </div>
    </div>
  );
}
