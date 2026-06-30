import { useState, useMemo } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

const plainTextLanguages = new Set(["text", "plain", "txt", ""]);

const LANG_CONFIGS: Record<string, { keywords: string[]; types: string[]; operators: string[]; comments: string[]; strings: string[] }> = {
  typescript: {
    keywords: ["import", "from", "export", "const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "new", "this", "async", "await", "yield", "throw", "try", "catch", "finally", "typeof", "instanceof", "in", "of", "class", "extends", "implements", "interface", "type", "enum", "namespace", "module", "declare", "readonly", "static", "public", "private", "protected", "abstract", "as", "any", "void", "never", "unknown", "undefined", "null", "true", "false", "super", "delete", "with", "debugger"],
    types: ["string", "number", "boolean", "object", "array", "Record", "Partial", "Required", "Pick", "Omit", "Promise", "Map", "Set", "Array", "Error"],
    operators: ["=>", "===", "!==", "==", "!=", ">=", "<=", "&&", "||", "??", "?.", "::"],
    comments: ["//", "/*", "*/", "///"],
    strings: ['"', "'", "`"],
  },
  javascript: {
    keywords: ["import", "from", "export", "const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "new", "this", "async", "await", "yield", "throw", "try", "catch", "finally", "typeof", "instanceof", "in", "of", "class", "extends", "super", "delete", "with", "debugger", "true", "false", "null", "undefined"],
    types: ["object", "array", "number", "string", "boolean", "Promise", "Map", "Set", "Error", "Array"],
    operators: ["=>", "===", "!==", "==", "!=", ">=", "<=", "&&", "||", "??", "?."],
    comments: ["//", "/*", "*/", "///"],
    strings: ['"', "'", "`"],
  },
  python: {
    keywords: ["import", "from", "def", "return", "if", "elif", "else", "for", "while", "break", "continue", "class", "try", "except", "finally", "raise", "with", "as", "pass", "yield", "async", "await", "in", "not", "and", "or", "is", "lambda", "self", "None", "True", "False", "global", "nonlocal", "assert", "del"],
    types: ["int", "str", "float", "bool", "list", "dict", "tuple", "set", "TypeVar", "Optional", "Union", "Any", "Callable"],
    operators: ["==", "!=", ">=", "<=", "=>", "->"],
    comments: ["#"],
    strings: ['"', "'"],
  },
  rust: {
    keywords: ["fn", "let", "mut", "const", "if", "else", "for", "while", "loop", "match", "return", "struct", "enum", "impl", "trait", "use", "mod", "pub", "self", "super", "crate", "async", "await", "move", "ref", "where", "type", "dyn", "in", "true", "false", "Some", "None", "Ok", "Err", "break", "continue", "unsafe", "extern", "static", "as", "macro_rules"],
    types: ["i32", "i64", "u32", "u64", "f32", "f64", "bool", "char", "str", "String", "Vec", "HashMap", "Option", "Result", "Box", "Rc", "Arc", "Mutex"],
    operators: ["=>", "==", "!=", ">=", "<=", "::", "->", "..", "..="],
    comments: ["//", "/*", "*/", "///", "//!"],
    strings: ['"', "'"],
  },
  go: {
    keywords: ["func", "return", "if", "else", "for", "range", "switch", "case", "break", "continue", "var", "const", "type", "struct", "interface", "map", "chan", "go", "defer", "select", "import", "package", "true", "false", "nil", "fallthrough", "default"],
    types: ["int", "int8", "int16", "int32", "int64", "uint", "string", "bool", "float32", "float64", "byte", "rune", "error", "any"],
    operators: ["==", "!=", ">=", "<=", "->", ":=", "&&", "||"],
    comments: ["//", "/*", "*/"],
    strings: ['"', "'", "`"],
  },
};

const FALLBACK_LANG = {
  keywords: [],
  types: [],
  operators: [],
  comments: ["//", "/*", "*/", "#"],
  strings: ['"', "'", "`"],
};

function getLangConfig(language: string) {
  const base = LANG_CONFIGS[language] || FALLBACK_LANG;
  return base;
}

function highlightCode(code: string, language: string): React.ReactNode[] {
  const config = getLangConfig(language);
  const lines = code.split("\n");
  const result: React.ReactNode[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const elements: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      const trimmed = remaining.trimStart();
      const leadingSpaces = remaining.length - trimmed.length;

      // 单行注释
      let matched = false;
      for (const commentStart of config.comments) {
        if (trimmed.startsWith(commentStart)) {
          if (leadingSpaces > 0) elements.push(remaining.slice(0, leadingSpaces));
          elements.push(<span key={`c${key++}`} style={{ color: 'var(--syntax-comment, #6a9955)' }}>{trimmed}</span>);
          remaining = "";
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 字符串
      for (const quote of config.strings) {
        const strMatch = trimmed.match(new RegExp(`${quote}[^${quote}]*${quote}`));
        if (strMatch && strMatch.index === 0) {
          if (leadingSpaces > 0) elements.push(remaining.slice(0, leadingSpaces));
          elements.push(<span key={`s${key++}`} style={{ color: 'var(--syntax-string, #ce9178)' }}>{strMatch[0]}</span>);
          remaining = remaining.slice(leadingSpaces + strMatch[0].length);
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 关键字
      if (!matched && leadingSpaces === 0) {
        const wordMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (wordMatch) {
          const word = wordMatch[1];
          const isKeyword = config.keywords.includes(word);
          const isType = config.types.includes(word);
          if (isKeyword) {
            elements.push(<span key={`k${key++}`} style={{ color: 'var(--syntax-keyword, #569cd6)' }}>{word}</span>);
            remaining = remaining.slice(word.length);
            matched = true;
          } else if (isType) {
            elements.push(<span key={`t${key++}`} style={{ color: 'var(--syntax-type, #4ec9b0)' }}>{word}</span>);
            remaining = remaining.slice(word.length);
            matched = true;
          }
        }
      }

      if (matched) continue;

      // 数字
      const numMatch = trimmed.match(/^(\b\d+(?:\.\d+)?\b)/);
      if (numMatch) {
        if (leadingSpaces > 0) elements.push(remaining.slice(0, leadingSpaces));
        elements.push(<span key={`n${key++}`} style={{ color: 'var(--syntax-number, #b5cea8)' }}>{numMatch[1]}</span>);
        remaining = remaining.slice(leadingSpaces + numMatch[1].length);
        continue;
      }

      // 运算符
      for (const op of config.operators) {
        if (trimmed.startsWith(op)) {
          if (leadingSpaces > 0) elements.push(remaining.slice(0, leadingSpaces));
          elements.push(<span key={`o${key++}`} style={{ color: 'var(--syntax-operator, #d4d4d4)' }}>{op}</span>);
          remaining = remaining.slice(leadingSpaces + op.length);
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // 单字符输出
      elements.push(remaining[0]);
      remaining = remaining.slice(1);
    }

    const lineNum = (
      <span key={`ln-${lineIdx}`} className="select-none mr-4 text-[11px] text-right inline-block w-8 shrink-0"
        style={{ color: 'var(--text-tertiary)' }}>
        {lineIdx + 1}
      </span>
    );

    result.push(
      <div key={lineIdx} className="flex px-4">
        {lineNum}
        <span className="whitespace-pre">{elements.length > 0 ? <>{elements}</> : <>&nbsp;</>}</span>
      </div>
    );
  }

  return result;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const hasHighlight = !plainTextLanguages.has(language || "");
  const highlighted = useMemo(() => {
    if (!hasHighlight) return null;
    return highlightCode(code, language || "");
  }, [code, language, hasHighlight]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden" style={{ background: "var(--code-bg)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid var(--border-light)" }}>
        <span className="text-[11px] font-mono font-medium" style={{ color: "var(--text-tertiary)" }}>
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] transition-all duration-150 px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: copied ? "var(--accent)" : "var(--text-tertiary)" }}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto text-sm leading-relaxed" style={{ maxHeight: "600px" }}>
        <code className="font-mono text-[13px]" style={{ color: "var(--text-primary)" }}>
          {highlighted || code.split("\n").map((line, i) => (
            <div key={i} className="flex px-4">
              <span className="select-none mr-4 text-[11px] text-right inline-block w-8 shrink-0" style={{ color: 'var(--text-tertiary)' }}>{i + 1}</span>
              <span className="whitespace-pre">{line || <>&nbsp;</>}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
