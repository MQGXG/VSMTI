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
      if (before) { parts.push(renderText(before, key++)); }
      parts.push(<CodeBlock key={`c-${key++}`} language={codeBlockMatch[1]} code={codeBlockMatch[2].replace(/\n$/, "")} />);
      remaining = remaining.slice(codeBlockMatch.index! + codeBlockMatch[0].length);
      continue;
    }

    // 查找下一个可能的表格（以 | 开头的行）
    const lines = remaining.split("\n");
    let tableStartIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        tableStartIndex = i;
        break;
      }
    }

    // 如果找到表格起始行
    if (tableStartIndex >= 0) {
      // 处理表格前的文本
      if (tableStartIndex > 0) {
        const beforeText = lines.slice(0, tableStartIndex).join("\n");
        if (beforeText.trim()) {
          parts.push(renderText(beforeText, key++));
        }
      }

      // 收集表格行
      let tableLines: string[] = [];
      let lineIndex = tableStartIndex;
      
      while (lineIndex < lines.length) {
        const trimmed = lines[lineIndex].trim();
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          tableLines.push(trimmed);
          lineIndex++;
        } else if (trimmed === "") {
          // 空行可能在表格行之间，跳过
          lineIndex++;
          break;
        } else {
          break;
        }
      }

      // 解析表格
      if (tableLines.length >= 2) {
        const headers = parseTableRow(tableLines[0]);
        let separatorIndex = 1;
        
        // 查找分隔行（包含 --- 或 :--- 等）
        while (separatorIndex < tableLines.length) {
          const cells = parseTableRow(tableLines[separatorIndex]);
          const isSeparator = cells.every(c => /^[-:]+$/.test(c));
          if (isSeparator) break;
          separatorIndex++;
        }

        if (separatorIndex < tableLines.length) {
          const separators = parseTableRow(tableLines[separatorIndex]);
          const bodyRows = tableLines.slice(separatorIndex + 1).map(r => parseTableRow(r));
          
          // 计算对齐方式
          const alignments = separators.map((sep) => {
            if (sep.startsWith(":") && sep.endsWith(":")) return "center";
            if (sep.endsWith(":")) return "right";
            if (sep.startsWith(":")) return "left";
            return "left";
          });

          parts.push(
            <div key={`t-${key++}`} className="my-4 overflow-x-auto rounded-xl" style={{ border: '1px solid #1A2E35' }}>
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#0F1A20' }}>
                    {headers.map((h, j) => (
                      <th key={j} className="px-4 py-2.5 text-left font-medium" 
                          style={{ 
                            borderBottom: '1px solid #1A2E35', 
                            color: '#E8F4F0',
                            textAlign: alignments[j] || 'left'
                          }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, j) => (
                    <tr key={j} style={{ borderTop: '1px solid #15252A' }}>
                      {row.map((c, k) => (
                        <td key={k} className="px-4 py-2" 
                            style={{ 
                              color: '#5C8D8A',
                              textAlign: alignments[k] || 'left'
                            }}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );

          remaining = lines.slice(lineIndex).join("\n").trimStart();
          continue;
        }
      }
    }

    // 图片 ![](url) 或 ![](url "title")
    const imgMatch = remaining.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
    if (imgMatch) {
      const before = remaining.slice(0, imgMatch.index);
      if (before) { parts.push(renderText(before, key++)); }
      parts.push(
        <div key={`img-${key++}`} className="my-3">
          <img src={imgMatch[2]} alt={imgMatch[1]} title={imgMatch[3] || imgMatch[1]}
            className="max-w-full rounded-xl" loading="lazy" style={{ border: '1px solid #1A2E35' }} />
        </div>
      );
      remaining = remaining.slice(imgMatch.index! + imgMatch[0].length);
      continue;
    }

    // 链接 [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const before = remaining.slice(0, linkMatch.index);
      if (before) { parts.push(renderText(before, key++)); }
      parts.push(<a key={`ln-${key++}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
        className="underline underline-offset-2 transition-colors hover:text-primary-400" style={{ color: '#00D9C0' }}>{linkMatch[1]}</a>);
      remaining = remaining.slice(linkMatch.index! + linkMatch[0].length);
      continue;
    }

    // 粗体 **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const before = remaining.slice(0, boldMatch.index);
      if (before) { parts.push(renderText(before, key++)); }
      parts.push(<strong key={`b-${key++}`} className="font-semibold" style={{ color: '#E8F4F0' }}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index! + boldMatch[0].length);
      continue;
    }

    // 斜体 *text*
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
    if (italicMatch) {
      const before = remaining.slice(0, italicMatch.index);
      if (before) { parts.push(renderText(before, key++)); }
      parts.push(<em key={`i-${key++}`} style={{ color: '#5C8D8A' }}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch.index! + italicMatch[0].length);
      continue;
    }

    // 分割线 ---
    const hrMatch = remaining.match(/^---+$/m);
    if (hrMatch && hrMatch.index === 0) {
      parts.push(<hr key={`hr-${key++}`} className="my-4" style={{ borderColor: '#1A2E35' }} />);
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
        <blockquote key={`q-${key++}`} className="my-3 pl-4 py-2 text-sm italic" style={{
          borderLeft: '3px solid #00D9C0', color: '#5C8D8A',
          background: 'rgba(0, 217, 192, 0.05)', borderRadius: '0 12px 12px 0'
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
        <ul key={`ul-${key++}`} className="list-disc list-inside space-y-1.5 my-3 text-sm" style={{ color: '#E8F4F0' }}>
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
        <ol key={`ol-${key++}`} className="list-decimal list-inside space-y-1.5 my-3 text-sm" style={{ color: '#E8F4F0' }}>
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
        <div key={`h-${key++}`} className={`text-${size} ${weight} mt-5 mb-3`} style={{ color: '#E8F4F0' }}>
          {headingMatch[2]}
        </div>
      );
      remaining = remaining.slice(headingMatch[0].length).trimStart();
      continue;
    }

    // 普通段落 - 找到下一个特殊字符或行尾
    const nextSpecialIndex = remaining.search(/[`*\[\]!>#|-]/);
    if (nextSpecialIndex > 0) {
      const text = remaining.slice(0, nextSpecialIndex);
      parts.push(renderText(text, key++));
      remaining = remaining.slice(nextSpecialIndex);
      continue;
    } else if (nextSpecialIndex === 0) {
      // 特殊字符在开头但没有匹配到任何模式，跳过一个字符
      parts.push(renderText(remaining[0], key++));
      remaining = remaining.slice(1);
      continue;
    }

    // 兜底 - 渲染剩余所有文本
    parts.push(renderText(remaining, key++));
    break;
  }

  return <>{parts}</>;
}

function parseTableRow(row: string): string[] {
  // 移除首尾的 |，然后按 | 分割
  const trimmed = row.trim();
  const content = trimmed.slice(1, -1);
  return content.split("|").map(c => c.trim());
}

function renderText(text: string, key: number): React.ReactNode {
  if (!text) return null;
  return (
    <span key={key} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#E8F4F0', lineHeight: '1.6' }}>
      {text}
    </span>
  );
}
