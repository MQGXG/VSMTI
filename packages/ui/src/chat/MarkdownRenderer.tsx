import { CodeBlock } from "./CodeBlock";
import { MermaidBlock } from "./MermaidBlock";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  while (remaining.length > 0) {
    const codeBlockMatch = remaining.match(/```(\w*)\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      const before = remaining.slice(0, codeBlockMatch.index);
      if (before) { parts.push(renderText(before, key++)); }
      const lang = codeBlockMatch[1];
      const code = codeBlockMatch[2];
      if (lang === "mermaid") {
        parts.push(<MermaidBlock key={`m-${key++}`} code={code.replace(/\n$/, "")} />);
      } else {
        parts.push(<CodeBlock key={`c-${key++}`} language={lang} code={code.replace(/\n$/, "")} />);
      }
      remaining = remaining.slice(codeBlockMatch.index! + codeBlockMatch[0].length);
      continue;
    }

    const processed = processBlock(remaining, key);
    if (processed) {
      parts.push(processed.element);
      remaining = processed.rest;
      key++;
      continue;
    }

    const advanced = advanceOneChar(remaining, key);
    parts.push(advanced.element);
    remaining = advanced.rest;
    key++;
  }

  return <>{parts}</>;
}

function processBlock(text: string, key: number): { element: React.ReactNode; rest: string } | null {
  const lines = text.split("\n");
  const firstLine = lines[0];

  // 标题
  const headingMatch = firstLine.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const size = ['2xl', 'xl', 'lg', 'base', 'sm', 'xs'][level - 1];
    const weight = level <= 2 ? 'font-semibold' : 'font-medium';
    const element = (
      <div key={`h-${key}`} className={`text-${size} ${weight} mt-5 mb-3`} style={{ color: 'var(--text-primary)' }}>
        {renderInline(headingMatch[2])}
      </div>
    );
    return { element, rest: text.slice(firstLine.length).trimStart() };
  }

  // 分割线
  if (/^---+$/.test(firstLine)) {
    return {
      element: <hr key={`hr-${key}`} className="my-4" style={{ borderColor: 'var(--border)' }} />,
      rest: text.slice(firstLine.length).trimStart(),
    };
  }

  // 引用
  if (firstLine.startsWith("> ")) {
    const quoteLines: string[] = [];
    let i = 0;
    for (const line of lines) {
      if (line.startsWith("> ")) { quoteLines.push(line.slice(2)); i++; }
      else if (line === ">" || line === "") { quoteLines.push(""); i++; }
      else break;
    }
    return {
      element: (
        <blockquote key={`q-${key}`} className="my-3 pl-4 py-2 text-sm italic" style={{
          borderLeft: '3px solid var(--accent-start)', color: 'var(--text-secondary)',
          background: 'rgba(0, 217, 192, 0.05)', borderRadius: '0 12px 12px 0'
        }}>
          {quoteLines.map((l, j) => <div key={j}>{renderInline(l) || <br />}</div>)}
        </blockquote>
      ),
      rest: lines.slice(i).join("\n").trimStart(),
    };
  }

  // 无序列表
  const ulMatch = text.match(/^(?:[-*]\s[^\n]*\n?)+/m);
  if (ulMatch && ulMatch.index === 0) {
    const items = ulMatch[0].split("\n").filter(l => l.trim()).map(l => l.replace(/^[-*]\s/, ""));
    return {
      element: (
        <ul key={`ul-${key}`} className="list-disc list-inside space-y-1.5 my-3 text-sm" style={{ color: 'var(--text-primary)' }}>
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ul>
      ),
      rest: text.slice(ulMatch[0].length).trimStart(),
    };
  }

  // 有序列表
  const olMatch = text.match(/^(?:\d+\.\s[^\n]*\n?)+/m);
  if (olMatch && olMatch.index === 0) {
    const items = olMatch[0].split("\n").filter(l => l.trim()).map(l => l.replace(/^\d+\.\s/, ""));
    return {
      element: (
        <ol key={`ol-${key}`} className="list-decimal list-inside space-y-1.5 my-3 text-sm" style={{ color: 'var(--text-primary)' }}>
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ol>
      ),
      rest: text.slice(olMatch[0].length).trimStart(),
    };
  }

  // 表格
  if (firstLine.trim().startsWith("|")) {
    return processTable(text, key, lines);
  }

  return null;
}

function processTable(text: string, key: number, lines: string[]): { element: React.ReactNode; rest: string } | null {
  let tableLines: string[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const trimmed = lines[lineIndex].trim();
    if (trimmed.startsWith("|")) {
      tableLines.push(trimmed);
      lineIndex++;
    } else if (trimmed === "") {
      lineIndex++;
      break;
    } else {
      break;
    }
  }

  if (tableLines.length < 2) return null;

  const headers = parseTableRow(tableLines[0]);
  let sepIndex = 1;
  while (sepIndex < tableLines.length) {
    const cells = parseTableRow(tableLines[sepIndex]);
    if (cells.every(c => /^[-:]+$/.test(c))) break;
    sepIndex++;
  }

  if (sepIndex >= tableLines.length) return null;

  const separators = parseTableRow(tableLines[sepIndex]);
  const bodyRows = tableLines.slice(sepIndex + 1).map(r => parseTableRow(r));
  const alignments = separators.map((sep) => {
    if (sep.startsWith(":") && sep.endsWith(":")) return "center";
    if (sep.endsWith(":")) return "right";
    if (sep.startsWith(":")) return "left";
    return "left";
  });

  return {
    element: (
      <div key={`t-${key}`} className="my-4 overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              {headers.map((h, j) => (
                <th key={j} className="px-4 py-2.5 text-left font-medium"
                    style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: alignments[j] || 'left' }}>
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, j) => (
              <tr key={j} style={{ borderTop: '1px solid var(--border-light)' }}>
                {row.map((c, k) => (
                  <td key={k} className="px-4 py-2"
                      style={{ color: 'var(--text-secondary)', textAlign: alignments[k] || 'left' }}>
                    {renderInline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    rest: lines.slice(lineIndex).join("\n").trimStart(),
  };
}

function parseTableRow(row: string): string[] {
  const trimmed = row.trim();
  const content = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const end = content.endsWith("|") ? content.slice(0, -1) : content;
  return end.split("|").map(c => c.trim());
}

function renderText(text: string, key: number): React.ReactNode {
  if (!text) return null;
  return (
    <span key={key} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)', lineHeight: '1.6' }}>
      {renderInline(text)}
    </span>
  );
}

function renderInline(text: string): React.ReactNode {
  if (!text) return null;
  const elements: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // 图片 ![](url)
    const imgMatch = remaining.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
    if (imgMatch && (!imgMatch.index || imgMatch.index === 0)) {
      if (imgMatch.index && imgMatch.index > 0) {
        elements.push(remaining.slice(0, imgMatch.index));
      }
      elements.push(
        <img key={`img-${key++}`} src={imgMatch[2]} alt={imgMatch[1]} title={imgMatch[3] || imgMatch[1]}
          className="max-w-full rounded-xl my-2" loading="lazy" style={{ border: '1px solid var(--border)' }} />
      );
      remaining = remaining.slice(imgMatch.index! + imgMatch[0].length);
      continue;
    }

    // 链接 [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch && (!linkMatch.index || linkMatch.index === 0)) {
      if (linkMatch.index && linkMatch.index > 0) {
        elements.push(remaining.slice(0, linkMatch.index));
      }
      elements.push(
        <a key={`ln-${key++}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-primary-400" style={{ color: 'var(--accent-start)' }}>
          {renderInline(linkMatch[1])}
        </a>
      );
      remaining = remaining.slice(linkMatch.index! + linkMatch[0].length);
      continue;
    }

    // 内联代码 `code`
    const codeMatch = remaining.match(/`([^`]+)`/);
    if (codeMatch && (!codeMatch.index || codeMatch.index === 0)) {
      if (codeMatch.index && codeMatch.index > 0) {
        elements.push(remaining.slice(0, codeMatch.index));
      }
      elements.push(
        <code key={`ic-${key++}`} className="px-1.5 py-0.5 rounded text-[13px] font-mono"
          style={{ background: 'var(--code-bg)', color: 'var(--accent)', border: '1px solid var(--border-light)' }}>
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch.index! + codeMatch[0].length);
      continue;
    }

    // 删除线 ~~text~~
    const delMatch = remaining.match(/~~([^~]+)~~/);
    if (delMatch && (!delMatch.index || delMatch.index === 0)) {
      if (delMatch.index && delMatch.index > 0) {
        elements.push(remaining.slice(0, delMatch.index));
      }
      elements.push(<del key={`d-${key++}`} style={{ color: 'var(--text-tertiary)' }}>{renderInline(delMatch[1])}</del>);
      remaining = remaining.slice(delMatch.index! + delMatch[0].length);
      continue;
    }

    // 粗体 **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch && (!boldMatch.index || boldMatch.index === 0)) {
      if (boldMatch.index && boldMatch.index > 0) {
        elements.push(remaining.slice(0, boldMatch.index));
      }
      elements.push(<strong key={`b-${key++}`} className="font-semibold" style={{ color: 'var(--text-primary)' }}>{renderInline(boldMatch[1])}</strong>);
      remaining = remaining.slice(boldMatch.index! + boldMatch[0].length);
      continue;
    }

    // 斜体 *text*
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
    if (italicMatch && (!italicMatch.index || italicMatch.index === 0)) {
      if (italicMatch.index && italicMatch.index > 0) {
        elements.push(remaining.slice(0, italicMatch.index));
      }
      elements.push(<em key={`i-${key++}`} style={{ color: 'var(--text-secondary)' }}>{renderInline(italicMatch[1])}</em>);
      remaining = remaining.slice(italicMatch.index! + italicMatch[0].length);
      continue;
    }

    // 无匹配，取下一个字符
    elements.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  return elements.length > 0 ? <>{elements}</> : null;
}

function advanceOneChar(text: string, key: number): { element: React.ReactNode; rest: string } {
  const nextSpecial = text.search(/[`*\[\]!>#|\-]/);
  if (nextSpecial > 0) {
    return {
      element: <span key={`t-${key}`} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)', lineHeight: '1.6' }}>{text.slice(0, nextSpecial)}</span>,
      rest: text.slice(nextSpecial),
    };
  }
  if (nextSpecial === 0 || text[0] === '\n') {
    // 找到换行位置
    const newlineIdx = text.indexOf('\n');
    if (newlineIdx >= 0) {
      return {
        element: <span key={`t-${key}`} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)', lineHeight: '1.6' }}>{text.slice(0, newlineIdx + 1)}</span>,
        rest: text.slice(newlineIdx + 1),
      };
    }
  }
  return {
    element: <span key={`t-${key}`} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)', lineHeight: '1.6' }}>{text}</span>,
    rest: "",
  };
}
