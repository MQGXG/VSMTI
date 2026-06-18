import { useEffect, useRef, useState } from "react";
import { Square, Send, Plus, Paperclip } from "lucide-react";
import { ToolPalette } from "./ToolPalette";
import type { ToolResult } from "@/types/electron";

interface Props {
  input: string;
  isLoading: boolean;
  disabled?: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
}

interface SkillInfo {
  name: string;
  description: string;
  category: string | null;
}

export function ChatInput({ input, isLoading, disabled, onInput, onSend, onStop, onToolResult }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [filteredSkills, setFilteredSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 加载技能列表
  useEffect(() => {
    window.electronAPI.agent.listSkills().then((list) => {
      setSkills(list);
    }).catch(() => {
      // 静默失败
    });
  }, []);

  // 输入变化时检查 slash 命令
  useEffect(() => {
    const match = input.match(/^\/{1}(\w*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const filtered = skills.filter(
        (s) => s.name.toLowerCase().includes(query) || `/${s.name.toLowerCase()}`.includes(query),
      );
      setFilteredSkills(filtered);
      setShowSkills(filtered.length > 0);
      setSelectedSkillIndex(0);
    } else {
      setShowSkills(false);
    }
  }, [input, skills]);

  function applySkill(skill: SkillInfo) {
    const prefix = `/${skill.name} `;
    onInput(prefix);
    setShowSkills(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showSkills) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSkillIndex((prev) => Math.min(prev + 1, filteredSkills.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSkillIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && filteredSkills[selectedSkillIndex]) {
        e.preventDefault();
        applySkill(filteredSkills[selectedSkillIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowSkills(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSend();
    }
  }

  return (
    <div className="space-y-2 relative">
      {/* 工具面板行 */}
      <div className="flex items-center gap-2">
        {onToolResult && <ToolPalette onResult={onToolResult} inputHint={input} />}
      </div>

      {/* Slash 命令补全下拉 */}
      {showSkills && (
        <div className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl overflow-hidden shadow-glass-lg"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-2 text-[10px] font-medium" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
            Skill 命令 (回车选择 / Esc 关闭)
          </div>
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {filteredSkills.map((skill, idx) => (
              <button
                key={skill.name}
                className={`w-full text-left px-4 py-2.5 text-sm transition-all duration-200 flex items-center gap-2 ${
                  idx === selectedSkillIndex
                    ? "bg-primary-500/10 text-primary-400"
                    : "text-neutral-300 hover:bg-neutral-800/50"
                }`}
                onMouseDown={() => applySkill(skill)}
              >
                <span className="font-medium text-primary-500">/</span>
                <span>{skill.name}</span>
                {skill.category && (
                  <span className="text-xs text-neutral-600 ml-auto">{skill.category}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入框容器 - 玻璃拟态效果 */}
      <div
        className={`relative flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-200 ${
          disabled
            ? "opacity-60"
            : ""
        }`}
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: isFocused ? '1px solid rgba(0, 217, 192, 0.5)' : '1px solid var(--input-border)',
          boxShadow: isFocused ? '0 0 0 3px rgba(0, 217, 192, 0.15)' : 'none',
        }}
      >
        {/* 附件按钮 */}
        <button
          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:bg-neutral-700/50"
          style={{ color: 'var(--text-secondary)' }}
          title="添加附件"
        >
          <Plus className="w-5 h-5" />
        </button>

        {/* 文本输入框 */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={disabled ? "AI 对话需连接后端，工具面板可直接使用" : "输入消息... (/ 查看 Skill, Shift+Enter 换行)"}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed disabled:cursor-not-allowed min-h-[24px] max-h-[200px]"
          style={{ lineHeight: '1.6', color: 'var(--text-primary)' }}
        />

        {/* 发送/停止按钮 */}
        <button
          onClick={isLoading ? onStop : onSend}
          disabled={(!input.trim() && !isLoading) || disabled}
          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
          style={{
            background: (input.trim() || isLoading) ? 'linear-gradient(135deg, var(--accent-start), var(--accent-end))' : 'var(--chip-bg)',
            color: (input.trim() || isLoading) ? '#ffffff' : 'var(--text-secondary)',
            boxShadow: (input.trim() || isLoading) ? '0 2px 8px rgba(0, 217, 192, 0.3)' : 'none',
          }}
        >
          {isLoading ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
