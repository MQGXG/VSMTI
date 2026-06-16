import { CodeBlock } from "./CodeBlock";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  while (remaining.length > 0) {
    // 代码块 ```lang\n...\n```
    const codeBlockMatch = remaining.match(/```(\w*)\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      const before = remaining.slice(0, codeBlockMatch.index);
      if (before) {
        parts.push(renderInline(before, key++));
      }
      parts.push(
        <CodeBlock
          key={`code-${key++}`}
          language={codeBlockMatch[1]}
          code={codeBlockMatch[2].replace(/\n$/, "")}
        />
      );
      remaining = remaining.slice(codeBlockMatch.index! + codeBlockMatch[0].length);
      continue;
    }

    // 内联代码 `code`
    const inlineCodeMatch = remaining.match(/`([^`]+)`/);
    if (inlineCodeMatch) {
      const before = remaining.slice(0, inlineCodeMatch.index);
      if (before) {
        parts.push(renderInline(before, key++));
      }
      parts.push(
        <code
          key={`ic-${key++}`}
          className="px-1.5 py-0.5 rounded bg-neutral-800 text-emerald-300 text-[13px] font-mono"
        >
          {inlineCodeMatch[1]}
        </code>
      );
      remaining = remaining.slice(inlineCodeMatch.index! + inlineCodeMatch[0].length);
      continue;
    }

    // 链接 [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const before = remaining.slice(0, linkMatch.index);
      if (before) {
        parts.push(renderInline(before, key++));
      }
      parts.push(
        <a
          key={`ln-${key++}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch.index! + linkMatch[0].length);
      continue;
    }

    // 粗体 **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const before = remaining.slice(0, boldMatch.index);
      if (before) {
        parts.push(renderInline(before, key++));
      }
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold text-neutral-100">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch.index! + boldMatch[0].length);
      continue;
    }

    // 列表项 - 用换行+行首特殊标记检测
    const lines = remaining.split("\n");
    const listItems: string[] = [];
    let isList = false;
    let i = 0;

    // 检查是否有列表项模式
    for (let j = 0; j < Math.min(lines.length, 5); j++) {
      const trimmed = lines[j].trim();
      if (/^[-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
        isList = true;
        listItems.push(trimmed);
        i = j + 1;
      } else if (isList && trimmed === "") {
        break; // 空行结束列表
      } else if (isList) {
        // 列表项结束
        break;
      } else {
        break;
      }
    }

    if (isList && listItems.length > 0) {
      parts.push(
        <ul key={`ul-${key++}`} className="list-disc list-inside space-y-1 my-2 text-sm text-neutral-200">
          {listItems.map((item, idx) => (
            <li key={idx}>{item.replace(/^[-*]\s/, "")}</li>
          ))}
        </ul>
      );
      remaining = lines.slice(i).join("\n");
      continue;
    }

    // 分段（连续空行）
    const paraMatch = remaining.match(/([^\n]+(?:\n[ \t]*[^\n]+)*)/);
    if (paraMatch) {
      parts.push(renderInline(paraMatch[1], key++));
      remaining = remaining.slice(paraMatch[0].length + 1);
      parts.push(<br key={`br-${key++}`} />);
      continue;
    }

    // 兜底：直接显示
    parts.push(renderInline(remaining, key++));
    break;
  }

  return <>{parts}</>;
}

function renderInline(text: string, key: number): React.ReactNode {
  // 处理行内 Markdown
  return (
    <span key={key} className="text-sm leading-relaxed text-neutral-200 whitespace-pre-wrap">
      {text}
    </span>
  );
}
