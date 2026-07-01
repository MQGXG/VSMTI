import type { ToolCallInfo } from "./types";
import {
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
} from "../components/assistant-ui/tool-fallback";

interface Props {
  info: ToolCallInfo;
}

function mapStatus(status: ToolCallInfo["status"]): "running" | "complete" | "incomplete" | "requires-action" {
  if (status === "running") return "running";
  if (status === "done") return "complete";
  return "incomplete";
}

export function ToolCallView({ info }: Props) {
  const status = mapStatus(info.status);
  const argsText = JSON.stringify(info.args, null, 2);

  return (
    <ToolFallbackRoot defaultOpen={status !== "running"}>
      <ToolFallbackTrigger toolName={info.name} status={status} />
      <ToolFallbackContent>
        <ToolFallbackArgs argsText={argsText} />
        {info.result && (
          <ToolFallbackResult resultText={info.result} />
        )}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
}
