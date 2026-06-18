import { useMessageTiming } from "@assistant-ui/react";
import { Clock } from "lucide-react";

export function MessageTimingDisplay() {
  const timing = useMessageTiming();
  if (!timing) return null;

  const parts: string[] = [];

  if (timing.totalStreamTime) {
    const secs = (timing.totalStreamTime / 1000).toFixed(1);
    parts.push(`${secs}s`);
  }

  if (timing.tokenCount) {
    parts.push(`${timing.tokenCount} tok`);
  }

  if (timing.tokensPerSecond) {
    parts.push(`${timing.tokensPerSecond} tok/s`);
  }

  if (timing.toolCallCount > 0) {
    parts.push(`${timing.toolCallCount} tool`);
  }

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
      <Clock className="w-2.5 h-2.5" />
      <span>{parts.join(" · ")}</span>
    </div>
  );
}
