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
      parts.push(<code key={`ic-${key++}`} className="px-1.5 py-0.5 rounded text-[13px] font-mono" style={{ background: 'rgba(0, 217, 192, 0.1)', color: '#4dc2ff' }}>{inlineCodeMatch[1]}</code>);
      remaining = remaining.slice(inlineCodeMatch.index! + inlineCodeMatch[0].length);
      continue;
    }

    // 图片 ![](url) 或 ![](url "title")
    const imgMatch = remaining.match(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
    if (imgMatch) {
      const before = remaining.slice(0, imgMatch.index);
      if (before) { parts.push(renderInline(before, key++)); }
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
      if (before) { parts.push(renderInline(before, key++)); }
      parts.push(<a key={`ln-${key++}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
        className="underline underline-offset-2 transition-colors hover:text-primary-400" style={{ color: '#00D9C0' }}>{linkMatch[1]}</a>);
      remaining = remaining.slice(linkMatch.index! + linkMatch[0].length);
      continue;
    }

    // 粗体 **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const before = remaining.slice(0, boldMatch.index);
      if (before) { parts.push(renderInline(before, key++)); }
      parts.push(<strong key={`b-${key++}`} className="font-semibold" style={{ color: '#E8F4F0' }}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index! + boldMatch[0].length);
      continue;
    }

    // 斜体 *text*
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);
    if (italicMatch) {
      const before = remaining.slice(0, italicMatch.index);
      if (before) { parts.push(renderInline(before, key++)); }
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

    // 表格 | col1 | col2 | - 改进版，支持更多格式
    const tableMatch = remaining.match(/(?:^|\n)(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)(?:\n|$)/);
    if (tableMatch) {
      const tableContent = tableMatch[0].trim();
      const rows = tableContent.split("\n").filter(r => r.trim());
      
      if (rows.length >= 2) {
        // 解析表头
        const headers = rows[0].split("|").map(c => c.trim()).filter(c => c);
        // 解析分隔行，获取对齐方式
        const separators = rows[1].split("|").map(c => c.trim()).filter(c => c);
        // 解析数据行
        const bodyRows = rows.slice(2).map(r => r.split("|").map(c => c.trim()).filter(c => c));
        
        if (headers.length > 0 && bodyRows.length > 0) {
          // 计算对齐方式
          const alignments = separators.map((sep, i) => {
            if (sep.startsWith(":") && sep.endsWith(":")) return "center";
            if (sep.endsWith(":")) return "right";
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
          
          // 移除已处理的表格内容
          const tableEndIndex = remaining.indexOf(tableContent) + tableContent.length;
          remaining = remaining.slice(tableEndIndex).trimStart();
          continue;
        }
      }
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

    // 段落 - 逐行处理以检测可能的表格
    const lines = remaining.split("\n");
    const firstLine = lines[0];
    
    // 检查是否是表格的开始（以 | 开头）
    if (firstLine.trim().startsWith("|")) {
      // 尝试收集完整的表格
      let tableLines: string[] = [];
      let lineIndex = 0;
      
      while (lineIndex < lines.length && lines[lineIndex].trim().startsWith("|")) {
        tableLines.push(lines[lineIndex]);
        lineIndex++;
      }
      
      if (tableLines.length >= 2) {
        // 重新组合并尝试匹配表格
        const tableText = tableLines.join("\n");
        const headers = tableLines[0].split("|").map(c => c.trim()).filter(c => c);
        const separators = tableLines[1].split("|").map(c => c.trim()).filter(c => c);
        const bodyRows = tableLines.slice(2).map(r => r.split("|").map(c => c.trim()).filter(c => c));
        
        if (headers.length > 0 && bodyRows.length >= 0) {
          // 计算对齐方式
          const alignments = separators.map((sep, i) => {
            if (sep.startsWith(":") && sep.endsWith(":")) return "center";
            if (sep.endsWith(":")) return "right";
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

    // 普通段落
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
    <span key={key} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#E8F4F0', lineHeight: '1.6' }}>
      {text}
    </span>
  );
}
