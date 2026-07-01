import {
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
} from "../components/assistant-ui/reasoning";

interface Props {
  text: string;
}

export function ThinkingBlock({ text }: Props) {
  if (!text) return null;
  return (
    <ReasoningRoot variant="muted" defaultOpen>
      <ReasoningTrigger active />
      <ReasoningContent>
        <ReasoningText>
          {text}
        </ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
}
