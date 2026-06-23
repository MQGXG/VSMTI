import { useState, useRef, useEffect, useCallback } from "react";
import {
  AuiIf, ComposerPrimitive, ThreadPrimitive, MessagePrimitive,
  ActionBarPrimitive, ErrorPrimitive, BranchPickerPrimitive,
  useAui, useAuiState,
} from "@assistant-ui/react";
import { MiraRuntimeProvider } from "./MiraRuntimeProvider";
import { ModelSelector, loadModelChoice, loadModeChoice } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import type { AgentMode } from "./types";
import type { MiraMessage } from "./mira-runtime";
import { PermissionDialog } from "./PermissionDialog";
import { QuestionDialog } from "./QuestionDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageTimingDisplay } from "./MessageTimingDisplay";
import { ThinkingBlock } from "./ThinkingBlock";
import { FileUp, Copy, RotateCcw, Pencil, ChevronLeft, ChevronRight, Square, Send, Paperclip } from "lucide-react";
import { MiraLogo } from "./MiraLogo";

interface Props { sessionId: string; onSessionChange?: (id: string) => void; }
interface SkillInfo { name: string; description: string; category: string | null; }

function ChatContent({ sessionId }: { sessionId: string }) {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(loadModelChoice);
  const [agentMode, setAgentMode] = useState<AgentMode>(loadModeChoice);
  const [goalCondition, setGoalCondition] = useState<string | null>(null);

  useEffect(() => {
    const modes: AgentMode[] = ["assistant", "expert", "action", "safe", "plan"];
    const h = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ta = document.querySelector("textarea");
        if (!document.activeElement?.isSameNode(ta) || !ta?.value) {
          e.preventDefault();
          const i = modes.indexOf(agentMode);
          setAgentMode(modes[(i + 1) % modes.length]);
          localStorage.setItem("chat_mode", modes[(i + 1) % modes.length]);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [agentMode]);

  return (
    <MiraRuntimeProvider sessionId={sessionId} selectedModel={selectedModel} agentMode={agentMode} goalCondition={goalCondition}>
      {(ctx) => (
        <ChatInner ctx={ctx}
          selectedModel={selectedModel} onModelChange={setSelectedModel}
          agentMode={agentMode} onModeChange={setAgentMode}
          goalCondition={goalCondition} setGoalCondition={setGoalCondition} />
      )}
    </MiraRuntimeProvider>
  );
}

interface ChatInnerProps {
  ctx: { messages: MiraMessage[]; isRunning: boolean; sendMessage: (c: string) => Promise<void>; retryMessage: (id: string) => Promise<void>;
    permissionReq: { tool_name: string; args: Record<string, unknown>; reason: string; request_id: string; channel?: string; } | null;
    questionReq: { question: string; options: string[]; request_id: string; } | null;
    handlePermission: (a: boolean | "always") => Promise<void>; handleQuestionAnswer: (a: string) => void; handleToolResult: (n: string, r: any) => void; };
  selectedModel: ModelOption; onModelChange: (m: ModelOption) => void;
  agentMode: AgentMode; onModeChange: (m: AgentMode) => void;
  goalCondition: string | null; setGoalCondition: (v: string | null) => void;
}

function WelcomeScreen({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4">
      <div className="mb-6">
        <MiraLogo size={80} />
      </div>
      <h1 className="text-3xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>Mira</h1>
      <p className="text-sm mb-10" style={{ color: "var(--text-tertiary)" }}>有什么可以帮助你的？</p>
      <div className="flex flex-wrap justify-center gap-2 max-w-sm">
        {[
          { label: "写作" }, { label: "编程" },
          { label: "分析数据" }, { label: "搜索信息" },
        ].map(({ label }) => (
          <button key={label} onClick={() => onSuggest(label)}
            className="px-4 py-2 text-xs rounded-full transition-all duration-200 hover:scale-105"
            style={{ background: "var(--surface-secondary)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageActions({ messageId, ctx }: { messageId: string; ctx: any }) {
  return (
    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <BranchPickerPrimitive.Root hideWhenSingleBranch className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        <BranchPickerPrimitive.Previous className="flex size-6 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30">
          <ChevronLeft className="w-3 h-3" />
        </BranchPickerPrimitive.Previous>
        <span className="tabular-nums"><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
        <BranchPickerPrimitive.Next className="flex size-6 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30">
          <ChevronRight className="w-3 h-3" />
        </BranchPickerPrimitive.Next>
      </BranchPickerPrimitive.Root>
      <div className="w-px h-3 mx-1" style={{ background: "var(--border)" }} />
      <ActionBarPrimitive.Root className="flex gap-0.5">
        <ActionBarPrimitive.Copy asChild>
          <button className="action-btn" title="复制"><Copy className="w-3 h-3" /></button>
        </ActionBarPrimitive.Copy>
        <button onClick={() => ctx.retryMessage(messageId)} className="action-btn" title="重试"><RotateCcw className="w-3 h-3" /></button>
        <ActionBarPrimitive.Edit asChild>
          <button className="action-btn" title="编辑"><Pencil className="w-3 h-3" /></button>
        </ActionBarPrimitive.Edit>
      </ActionBarPrimitive.Root>
    </div>
  );
}

function ChatInner({ ctx, selectedModel, onModelChange, agentMode, onModeChange, goalCondition, setGoalCondition }: ChatInnerProps) {
  const aui = useAui();
  const composerText = useAuiState((s) => s.composer.text);
  const composerIsEmpty = useAuiState((s) => s.composer.isEmpty);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [filteredSkills, setFilteredSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    window.electronAPI.agent.listSkills().then((l) => setSkills(l)).catch(() => {});
  }, []);

  useEffect(() => {
    const m = composerText.match(/^\/{1}(\w*)$/);
    if (m) { const q = m[1].toLowerCase(); const f = skills.filter((s) => s.name.toLowerCase().includes(q)); setFilteredSkills(f); setShowSkills(f.length > 0); setSelectedSkillIndex(0); }
    else { setShowSkills(false); }
  }, [composerText, skills]);

  const onEnter = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) setIsDragging(true); }, []);
  const onLeave = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }, []);
  const onOver = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0;
    const files = e.dataTransfer?.files; if (!files || files.length === 0) return;
    const paths: string[] = []; for (let i = 0; i < files.length; i++) paths.push((files[i] as any).path || files[i].name);
    if (paths.length > 0) { aui.composer().setText("读取文件: " + paths.join(", ")); textareaRef.current?.focus(); }
  }, [aui]);
  useEffect(() => {
    const el = document.body; el.addEventListener("dragenter", onEnter); el.addEventListener("dragleave", onLeave);
    el.addEventListener("dragover", onOver); el.addEventListener("drop", onDrop);
    return () => { el.removeEventListener("dragenter", onEnter); el.removeEventListener("dragleave", onLeave); el.removeEventListener("dragover", onOver); el.removeEventListener("drop", onDrop); };
  }, [onEnter, onLeave, onOver, onDrop]);

  function applySkill(skill: SkillInfo) { aui.composer().setText("/" + skill.name + " "); setShowSkills(false); textareaRef.current?.focus(); }
  function handleKeyDown(e: React.KeyboardEvent) {
    if (showSkills) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedSkillIndex((p) => Math.min(p + 1, filteredSkills.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedSkillIndex((p) => Math.max(p - 1, 0)); return; }
      if (e.key === "Enter" && !e.shiftKey && filteredSkills[selectedSkillIndex]) { e.preventDefault(); applySkill(filteredSkills[selectedSkillIndex]); return; }
      if (e.key === "Escape") { setShowSkills(false); return; }
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--surface)" }}>
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,17,23,0.9)", backdropFilter: "blur(8px)" }}>
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto" style={{ background: "rgba(59,130,246,0.1)", border: "2px dashed rgba(59,130,246,0.4)" }}>
              <FileUp className="w-10 h-10" style={{ color: "var(--accent)" }} />
            </div>
            <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>释放以上传文件</p>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>支持文本文件、图片、代码等</p>
          </div>
        </div>
      )}

      <ThreadPrimitive.Root className="flex-1 flex flex-col min-h-0 custom-scrollbar">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4">
          <div className="flex flex-col mx-auto py-4 min-h-full" style={{ maxWidth: "768px", width: "100%" }}>
            <AuiIf condition={(s) => s.thread.isEmpty}>
              <WelcomeScreen onSuggest={(text) => { aui.composer().setText(text); textareaRef.current?.focus(); }} />
            </AuiIf>

            <ThreadPrimitive.Messages>
              {({ message }) => {
                const orig = ctx.messages.find(m => m.id === message.id);
                const isUser = message.role === "user";
                return (
                  <MessagePrimitive.Root className="group mb-4 animate-fade-in-up">
                    {orig?.thinking && <ThinkingBlock text={orig.thinking} />}
                    <div className={`flex w-full gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                      <div className="shrink-0">
                        {isUser
                          ? <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)", color: "#fff" }}>U</div>
                          : <MiraLogo size={32} />}
                      </div>
                      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[calc(100%-60px)]`}>
                        {isUser ? (
                          <div className="message-user px-5 py-4">
                            <MessagePrimitive.Parts>
                              {({ part }) => { if (part.type === "text") return <p className="text-sm whitespace-pre-wrap" style={{ color: "#fff", lineHeight: "1.6" }}>{part.text}</p>; return null; }}
                            </MessagePrimitive.Parts>
                          </div>
                        ) : (
                          <div className="message-assistant px-5 py-4">
                            <MessagePrimitive.Parts>
                              {({ part }) => { if (part.type === "text") return <MarkdownRenderer content={part.text} />; return null; }}
                            </MessagePrimitive.Parts>
                          </div>
                        )}
                        <MessagePrimitive.Error>
                          <ErrorPrimitive.Root className="mt-2 rounded-md bg-red-900/20 border border-red-500/20 px-3 py-2 text-xs text-red-500" role="alert"><ErrorPrimitive.Message /></ErrorPrimitive.Root>
                        </MessagePrimitive.Error>
                        {!isUser && <MessageTimingDisplay />}
                        {!isUser && <MessageActions messageId={message.id} ctx={ctx} />}
                      </div>
                    </div>
                  </MessagePrimitive.Root>
                );
              }}
            </ThreadPrimitive.Messages>
            <div className="h-4" />
          </div>

          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 border-t z-10" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="mx-auto px-4 pt-3 pb-4" style={{ maxWidth: "768px" }}>
              {showSkills && (
                <div className="mb-3 rounded-xl overflow-hidden shadow-lg" style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}>
                  <div className="px-3 py-1.5 text-[10px] font-medium" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-light)" }}>
                    Skill 命令 — 回车选择 / Esc 关闭
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    {filteredSkills.map((skill, idx) => (
                      <button key={skill.name} onMouseDown={() => applySkill(skill)}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${idx === selectedSkillIndex ? "bg-primary-500/10" : ""}`}
                        style={{ color: idx === selectedSkillIndex ? "var(--accent)" : "var(--text-secondary)" }}>
                        <span className="font-mono font-medium" style={{ color: "var(--accent)" }}>/</span>
                        <span className="font-medium">{skill.name}</span>
                        {skill.category && <span className="text-[10px] ml-auto" style={{ color: "var(--text-tertiary)" }}>{skill.category}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <ComposerPrimitive.Root className="composer-root flex items-end gap-2 rounded-2xl px-4 py-3 transition-all duration-200"
                  style={{
                    background: "var(--glass-bg)", backdropFilter: "blur(16px)",
                    border: isFocused ? "1px solid rgba(59,130,246,0.5)" : "1px solid var(--input-border)",
                    boxShadow: isFocused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
                  }}>
                  <button className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: "var(--text-tertiary)" }} title="添加附件">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <ComposerPrimitive.Input ref={textareaRef} onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
                    placeholder="输入消息... (Shift+Enter 换行)" rows={1}
                    className="flex-1 bg-transparent text-sm outline-none resize-none min-h-[24px] max-h-[200px]"
                    style={{ lineHeight: "1.6", color: "var(--text-primary)" }} />
                  {ctx.isRunning ? (
                    <ComposerPrimitive.Cancel asChild>
                      <button className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                        <Square className="w-3.5 h-3.5" fill="currentColor" />
                      </button>
                    </ComposerPrimitive.Cancel>
                  ) : (
                    <ComposerPrimitive.Send asChild>
                      <button className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200"
                        style={{
                          background: !composerIsEmpty ? "linear-gradient(135deg, var(--accent-start), var(--accent-end))" : "transparent",
                          color: !composerIsEmpty ? "#fff" : "var(--text-tertiary)",
                          boxShadow: !composerIsEmpty ? "0 2px 8px rgba(59,130,246,0.3)" : "none",
                        }}>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </ComposerPrimitive.Send>
                  )}
                </ComposerPrimitive.Root>

                <div className="flex items-center justify-between">
                  <ModelSelector selectedModel={selectedModel} onModelChange={onModelChange} agentMode={agentMode} onModeChange={onModeChange} />
                </div>

                {goalCondition && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(255,184,0,0.08)", border: "1px solid rgba(255,184,0,0.15)" }}>
                    <span className="font-medium" style={{ color: "#FFB800" }}>Goal</span>
                    <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{goalCondition}</span>
                    <button onClick={() => setGoalCondition(null)} className="px-2 py-0.5 rounded-md text-[10px] transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: "var(--text-tertiary)" }}>清除</button>
                  </div>
                )}
              </div>
            </div>
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      {ctx.questionReq && <QuestionDialog question={ctx.questionReq.question} options={ctx.questionReq.options} onSubmit={ctx.handleQuestionAnswer} />}
      {ctx.permissionReq && <PermissionDialog toolName={ctx.permissionReq.tool_name} args={ctx.permissionReq.args} reason={ctx.permissionReq.reason}
        onAllow={() => ctx.handlePermission(true)} onDeny={() => ctx.handlePermission(false)}
        onAlways={ctx.permissionReq.channel ? () => ctx.handlePermission("always") : undefined} />}
    </div>
  );
}

export function ChatWindow({ sessionId, onSessionChange }: Props) {
  return <ChatContent key={sessionId} sessionId={sessionId} />;
}
