import {
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
} from "../components/assistant-ui/reasoning";

interface Props {
  text: string;
  /** 是否默认展开（默认 false=折叠，参考 OpenCode 默认折叠思考过程） */
  defaultOpen?: boolean;
  /** 流式生成中（正在思考） */
  active?: boolean;
}

export function ThinkingBlock({ text, defaultOpen = false, active = false }: Props) {
  if (!text) return null;

  return (
    <ReasoningRoot variant="muted" defaultOpen={defaultOpen}>
      <ReasoningTrigger active={active} />
      <ReasoningContent>
        <ReasoningText>
          {text}
        </ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
}
