import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { ToolPalette } from "./ToolPalette";
import type { ToolResult } from "@/types/electron";

interface Props {
  input: string;
  isLoading: boolean;
  disabled?: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
}

interface SkillInfo {
  name: string;
  description: string;
  category: string | null;
}

export function ChatInput({ input, isLoading, disabled, onInput, onSend, onToolResult }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [filteredSkills, setFilteredSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
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
      <div className="flex items-center gap-1">
        {onToolResult && <ToolPalette onResult={onToolResult} inputHint={input} />}
      </div>

      {/* Slash 命令补全下拉 */}
      {showSkills && (
        <div className="absolute bottom-full mb-2 left-0 right-0 z-50 glass-heavy rounded-xl border border-glass-border overflow-hidden shadow-xl">
          <div className="px-3 py-1.5 text-xs text-neutral-500 border-b border-glass-border">
            Skill 命令 (回车选择 / Esc 关闭)
          </div>
          {filteredSkills.map((skill, idx) => (
            <button
              key={skill.name}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                idx === selectedSkillIndex
                  ? "bg-accent-500/20 text-accent-300"
                  : "text-neutral-300 hover:bg-white/5"
              }`}
              onMouseDown={() => applySkill(skill)}
            >
              <span className="font-medium text-accent-400">/</span>
              <span>{skill.name}</span>
              {skill.category && (
                <span className="text-xs text-neutral-500 ml-auto">{skill.category}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div
        className={`relative flex items-end gap-2 rounded-2xl px-4 py-3 transition-all duration-200 ${
          disabled
            ? "glass opacity-60"
            : "glass-heavy focus-within:border-accent-500/30 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.08)]"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "AI 对话需连接后端，工具面板可直接使用" : "输入消息... (/ 查看 Skill, Shift+Enter 换行)"}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-gray-900 dark:text-neutral-200 placeholder-neutral-500 outline-none resize-none leading-relaxed disabled:cursor-not-allowed"
        />

        <button
          onClick={onSend}
          disabled={!input.trim() || isLoading || disabled}
          className="flex-shrink-0 w-9 h-9 rounded-xl btn-gradient text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
