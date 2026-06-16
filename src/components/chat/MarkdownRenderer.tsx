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
      if (before) { parts.push(renderInline(before, key++)); }
      parts.push(<CodeBlock key={`c-${key++}`} language={codeBlockMatch[1]} code={codeBlockMatch[2].replace(/\n$/, "")} />);
      remaining = remaining.slice(codeBlockMatch.index! + codeBlockMatch[0].length);
      continue;
    }

    // 内联代码 `code`
    const inlineCodeMatch = remaining.match(/`([^`]+)`/);
    if (inlineCodeMatch) {
      const before = remaining.slice(0, inlineCodeMatch.index);
      if (before) { parts.push(renderInline(before, key++)); }
      parts.push(<code key={`ic-${key++}`} className="px-1.5 py-0.5 rounded text-[13px] font-mono" style={{ background: 'var(--surface-tertiary)', color: 'var(--accent-start)' }}>{inlineCodeMatch[1]}</code>);
      remaining = remaining.slice(inlineCodeMatch.index! + inlineCodeMatch[0].length);
      continue;
    }

    // 图片 ![](url) 或 ![](url "title")
    const imgMatch = remaining.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
    if (imgMatch) {
      const before = remaining.slice(0, imgMatch.index);
      if (before) { parts.push(renderInline(before, key++)); }
      parts.push(
        <div key={`img-${key++}`} className="my-2">
          <img src={imgMatch[2]} alt={imgMatch[1]} title={imgMatch[3] || imgMatch[1]}
            className="max-w-full rounded-lg" loading="lazy" />
        </div>
      );
      remaining = remaining.slice(imgMatch.index! + imgMatch[0].length);
      continue;
    }

    // 链接 [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const before = remaining.slice(0, linkMatch.index);
      if (before) { parts.push(renderInline(before, key++)); }
      parts.push(<a key={`ln-${key++}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
        className="underline underline-offset-2" style={{ color: 'var(--accent-start)' }}>{linkMatch[1]}</a>);
      remaining = remaining.slice(linkMatch.index! + linkMatch[0].length);
      continue;
    }

    // 粗体 **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const before = remaining.slice(0, boldMatch.index);
      if (before) { parts.push(renderInline(before, key++)); }
      parts.push(<strong key={`b-${key++}`} className="font-semibold" style={{ color: 'var(--text-primary)' }}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index! + boldMatch[0].length);
      continue;
    }

    // 斜体 *text*
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
    if (italicMatch) {
      const before = remaining.slice(0, italicMatch.index);
      if (before) { parts.push(renderInline(before, key++)); }
      parts.push(<em key={`i-${key++}`} style={{ color: 'var(--text-secondary)' }}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch.index! + italicMatch[0].length);
      continue;
    }

    // 分割线 ---
    const hrMatch = remaining.match(/^---+$/m);
    if (hrMatch && hrMatch.index === 0) {
      parts.push(<hr key={`hr-${key++}`} className="my-3" style={{ borderColor: 'var(--border)' }} />);
      remaining = remaining.slice(hrMatch[0].length).trimStart();
      continue;
    }

    // 引用 > text
    if (remaining.startsWith("> ")) {
      const lines = remaining.split("\n");
      const quoteLines: string[] = [];
      let i = 0;
      for (const line of lines) {
        if (line.startsWith("> ")) { quoteLines.push(line.slice(2)); i++; }
        else if (line === ">" || line === "") { quoteLines.push(""); i++; }
        else break;
      }
      parts.push(
        <blockquote key={`q-${key++}`} className="my-2 pl-3 py-1 text-sm italic" style={{
          borderLeft: '3px solid var(--accent-start)', color: 'var(--text-secondary)',
          background: 'var(--surface-tertiary)', borderRadius: '0 6px 6px 0'
        }}>
          {quoteLines.map((l, j) => <div key={j}>{l || <br />}</div>)}
        </blockquote>
      );
      remaining = lines.slice(i).join("\n").trimStart();
      continue;
    }

    // 无序列表
    const ulMatch = remaining.match(/^(?:[-*]\s[^\n]*\n?)+/m);
    if (ulMatch && ulMatch.index === 0) {
      const items = ulMatch[0].split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*]\s/, ""));
      parts.push(
        <ul key={`ul-${key++}`} className="list-disc list-inside space-y-1 my-2 text-sm" style={{ color: 'var(--text-primary)' }}>
          {items.map((item, j) => <li key={j}>{item}</li>)}
        </ul>
      );
      remaining = remaining.slice(ulMatch[0].length).trimStart();
      continue;
    }

    // 有序列表
    const olMatch = remaining.match(/^(?:\d+\.\s[^\n]*\n?)+/m);
    if (olMatch && olMatch.index === 0) {
      const items = olMatch[0].split("\n").filter(l => l.trim()).map(l => l.replace(/^\d+\.\s/, ""));
      parts.push(
        <ol key={`ol-${key++}`} className="list-decimal list-inside space-y-1 my-2 text-sm" style={{ color: 'var(--text-primary)' }}>
          {items.map((item, j) => <li key={j}>{item}</li>)}
        </ol>
      );
      remaining = remaining.slice(olMatch[0].length).trimStart();
      continue;
    }

    // 标题 ### text
    const headingMatch = remaining.match(/^(#{1,6})\s+(.+)$/m);
    if (headingMatch && headingMatch.index === 0) {
      const level = headingMatch[1].length;
      const size = ['2xl', 'xl', 'lg', 'base', 'sm', 'xs'][level - 1];
      const weight = level <= 2 ? 'font-semibold' : 'font-medium';
      parts.push(
        <div key={`h-${key++}`} className={`text-${size} ${weight} mt-4 mb-2`} style={{ color: 'var(--text-primary)' }}>
          {headingMatch[2]}
        </div>
      );
      remaining = remaining.slice(headingMatch[0].length).trimStart();
      continue;
    }

    // 表格 | col1 | col2 |
    const tableMatch = remaining.match(/^(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)*)/m);
    if (tableMatch && tableMatch.index === 0) {
      const rows = tableMatch[1].trim().split("\n").filter(r => r.trim());
      if (rows.length >= 2) {
        const headers = rows[0].split("|").filter(c => c.trim()).map(c => c.trim());
        const bodyRows = rows.slice(2).map(r => r.split("|").filter(c => c.trim()).map(c => c.trim()));
        parts.push(
          <div key={`t-${key++}`} className="my-3 overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--surface-tertiary)' }}>
                {headers.map((h, j) => <th key={j} className="px-3 py-2 text-left font-medium" style={{ borderBottom: '1px solid var(--border)' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {bodyRows.map((row, j) => (
                  <tr key={j} style={{ borderTop: '1px solid var(--border-light)' }}>
                    {row.map((c, k) => <td key={k} className="px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        remaining = remaining.slice(tableMatch[0].length).trimStart();
        continue;
      }
    }

    // 段落
    const paraMatch = remaining.match(/([^\n]+(?:\n[ \t]*[^\n]+)*)/);
    if (paraMatch) {
      parts.push(renderInline(paraMatch[1], key++));
      remaining = remaining.slice(paraMatch[0].length + 1);
      parts.push(<br key={`br-${key++}`} />);
      continue;
    }

    // 兜底
    parts.push(renderInline(remaining, key++));
    break;
  }

  return <>{parts}</>;
}

function renderInline(text: string, key: number): React.ReactNode {
  return (
    <span key={key} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
      {text}
    </span>
  );
}
