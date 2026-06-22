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
import { FileUp, Copy, RotateCcw, Pencil, ChevronLeft, ChevronRight, Square, Send } from "lucide-react";
import { MiraLogo } from "./MiraLogo";

interface Props { sessionId: string; onSessionChange?: (id: string) => void; }
interface SkillInfo { name: string; description: string; category: string | null; }

function ChatContent({ sessionId }: { sessionId: string }) {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(loadModelChoice);
  const [agentMode, setAgentMode] = useState<AgentMode>(loadModeChoice);
  const [isFocused, setIsFocused] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [filteredSkills, setFilteredSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [goalCondition, setGoalCondition] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.agent.listSkills().then((l) => setSkills(l)).catch(() => {});
  }, []);
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
        <ChatInner ctx={ctx} isFocused={isFocused} setIsFocused={setIsFocused}
          skills={skills} showSkills={showSkills} setShowSkills={setShowSkills}
          filteredSkills={filteredSkills} setFilteredSkills={setFilteredSkills}
          selectedSkillIndex={selectedSkillIndex} setSelectedSkillIndex={setSelectedSkillIndex}
          selectedModel={selectedModel} setSelectedModel={setSelectedModel}
          agentMode={agentMode} setAgentMode={setAgentMode}
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
  isFocused: boolean; setIsFocused: (v: boolean) => void;
  skills: SkillInfo[]; showSkills: boolean; setShowSkills: (v: boolean) => void;
  filteredSkills: SkillInfo[]; setFilteredSkills: (v: SkillInfo[]) => void;
  selectedSkillIndex: number; setSelectedSkillIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedModel: ModelOption; setSelectedModel: (m: ModelOption) => void;
  agentMode: AgentMode; setAgentMode: (m: AgentMode) => void;
  goalCondition: string | null; setGoalCondition: (v: string | null) => void;
}

function ChatInner({ ctx, isFocused, setIsFocused, skills, showSkills, setShowSkills,
  filteredSkills, setFilteredSkills, selectedSkillIndex, setSelectedSkillIndex,
  selectedModel, setSelectedModel, agentMode, setAgentMode, goalCondition, setGoalCondition }: ChatInnerProps) {
  const aui = useAui();
  const composerText = useAuiState((s) => s.composer.text);
  const composerIsEmpty = useAuiState((s) => s.composer.isEmpty);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const m = composerText.match(/^\/{1}(\w*)$/);
    if (m) { const q = m[1].toLowerCase(); const f = skills.filter((s) => s.name.toLowerCase().includes(q)); setFilteredSkills(f); setShowSkills(f.length > 0); setSelectedSkillIndex(0); }
    else { setShowSkills(false); }
  }, [composerText, skills]);

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
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
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--surface)" }}>
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

      {/* CSS Grid 布局：消息区占满，输入区固定高度 */}
      <div className="flex-1 grid min-h-0" style={{ gridTemplateRows: "1fr auto" }}>

        {/* ===== 消息区域（滚动） ===== */}
        <div className="min-h-0 overflow-y-auto scroll-smooth custom-scrollbar">
          <ThreadPrimitive.Root>
            <ThreadPrimitive.Viewport>
              <AuiIf condition={(s) => s.thread.isEmpty}>
                <div className="flex flex-col items-center text-center mx-auto px-4 pt-4" style={{ maxWidth: "800px", minHeight: "50vh", justifyContent: "center" }}>
                  <MiraLogo size={72} className="mb-6" />
                  <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Mira</h1>
                  <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>你的桌面全能 AI 助手</p>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[{ icon: "📝", l: "写作" }, { icon: "🔍", l: "搜索" }, { icon: "💻", l: "编程" }, { icon: "📊", l: "分析" }, { icon: "🌐", l: "翻译" }, { icon: "📁", l: "文件" }].map(({ icon, l }) => (
                      <button key={l} onClick={() => { aui.composer().setText("帮我" + l); textareaRef.current?.focus(); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200 hover:scale-[1.02]"
                        style={{ background: "var(--surface-secondary)", border: "1px solid var(--border)" }}>
                        <span className="text-xl">{icon}</span>
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{l}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>输入消息开始对话</p>
                </div>
              </AuiIf>

              <div className="flex flex-col gap-y-6 empty:hidden mx-auto px-4 pt-4 pb-4" style={{ maxWidth: "800px" }}>
                <ThreadPrimitive.Messages>
                  {({ message }) => {
                    const orig = ctx.messages.find(m => m.id === message.id);
                    return (
                      <MessagePrimitive.Root className="group mb-5 animate-fade-in-up">
                        {orig?.thinking && <ThinkingBlock text={orig.thinking} />}
                        <div className={`flex w-full gap-3 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                          <div className="shrink-0">
                            {message.role === "user"
                              ? <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)", color: "#fff" }}>U</div>
                              : <MiraLogo size={32} />}
                          </div>
                          <div className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"} max-w-[calc(100%-60px)]`}>
                            {message.role === "assistant" ? (
                              <div className="message-assistant px-5 py-4">
                                <MessagePrimitive.Parts>
                                  {({ part }) => { if (part.type === "text") { const t = "text" in part ? (part as any).text : ""; return <MarkdownRenderer content={t} />; } return null; }}
                                </MessagePrimitive.Parts>
                              </div>
                            ) : (
                              <div className="message-user px-5 py-4">
                                <MessagePrimitive.Parts>
                                  {({ part }) => { if (part.type === "text") { const t = "text" in part ? (part as any).text : ""; return <p className="text-sm whitespace-pre-wrap" style={{ color: "#fff", lineHeight: "1.6" }}>{t}</p>; } return null; }}
                                </MessagePrimitive.Parts>
                              </div>
                            )}
                            <MessagePrimitive.Error>
                              <ErrorPrimitive.Root className="mt-2 rounded-md bg-red-900/20 border border-red-500/20 px-3 py-2 text-xs text-red-400" role="alert"><ErrorPrimitive.Message /></ErrorPrimitive.Root>
                            </MessagePrimitive.Error>
                            {message.role === "assistant" && <MessageTimingDisplay />}
                            <div className="flex items-center justify-between mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <BranchPickerPrimitive.Root hideWhenSingleBranch className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                                <BranchPickerPrimitive.Previous className="flex size-5 items-center justify-center rounded hover:bg-neutral-700/50 disabled:opacity-30"><ChevronLeft className="w-3 h-3" /></BranchPickerPrimitive.Previous>
                                <span className="tabular-nums"><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
                                <BranchPickerPrimitive.Next className="flex size-5 items-center justify-center rounded hover:bg-neutral-700/50 disabled:opacity-30"><ChevronRight className="w-3 h-3" /></BranchPickerPrimitive.Next>
                              </BranchPickerPrimitive.Root>
                              {message.role === "assistant" && (
                                <ActionBarPrimitive.Root className="flex gap-1 justify-start">
                                  <ActionBarPrimitive.Copy asChild><button className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] btn-ghost"><Copy className="w-3 h-3" /><span>复制</span></button></ActionBarPrimitive.Copy>
                                  <button onClick={() => ctx.retryMessage(message.id as string)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] btn-ghost"><RotateCcw className="w-3 h-3" /><span>重试</span></button>
                                  <ActionBarPrimitive.Edit asChild><button className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] btn-ghost"><Pencil className="w-3 h-3" /><span>编辑</span></button></ActionBarPrimitive.Edit>
                                </ActionBarPrimitive.Root>
                              )}
                            </div>
                          </div>
                        </div>
                      </MessagePrimitive.Root>
                    );
                  }}
                </ThreadPrimitive.Messages>
              </div>
            </ThreadPrimitive.Viewport>
          </ThreadPrimitive.Root>
        </div>

        {/* ===== 输入区域（固定底部，不滚动） ===== */}
        <div className="shrink-0 flex flex-col gap-4 px-4 pb-4 pt-2" style={{ maxWidth: "800px", margin: "0 auto", width: "100%", background: "var(--surface)", borderTop: "1px solid var(--border-light)" }}>
          {showSkills && (
            <div className="rounded-xl overflow-hidden shadow-lg" style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}>
              <div className="px-4 py-2 text-[10px] font-medium" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--border)" }}>Skill 命令 (回车选择 / Esc 关闭)</div>
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {filteredSkills.map((skill, idx) => (
                  <button key={skill.name} onMouseDown={() => applySkill(skill)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-all duration-200 flex items-center gap-2 ${idx === selectedSkillIndex ? "bg-primary-500/10 text-primary-400" : ""}`}
                    style={{ color: idx === selectedSkillIndex ? undefined : "var(--text-secondary)" }}>
                    <span className="font-medium" style={{ color: "var(--accent-start)" }}>/</span>
                    <span>{skill.name}</span>
                    {skill.category && <span className="text-xs ml-auto" style={{ color: "var(--text-tertiary)" }}>{skill.category}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ComposerPrimitive.Root className="relative flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-200"
            style={{ background: "var(--glass-bg)", backdropFilter: "blur(16px)", border: isFocused ? "1px solid rgba(59,130,246,0.5)" : "1px solid var(--input-border)", boxShadow: isFocused ? "0 0 0 3px rgba(59,130,246,0.15)" : "none" }}>
            <ComposerPrimitive.Input ref={textareaRef} onKeyDown={handleKeyDown} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
              placeholder="输入消息..." rows={1} className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed min-h-[24px] max-h-[200px]"
              style={{ lineHeight: "1.6", color: "var(--text-primary)" }} />
            {ctx.isRunning ? (
              <ComposerPrimitive.Cancel asChild>
                <button className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                  <Square className="w-4 h-4" fill="currentColor" />
                </button>
              </ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send asChild>
                <button className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: !composerIsEmpty ? "linear-gradient(135deg, var(--accent-start), var(--accent-end))" : "var(--chip-bg)", color: !composerIsEmpty ? "#fff" : "var(--text-secondary)", boxShadow: !composerIsEmpty ? "0 2px 8px rgba(59,130,246,0.3)" : "none" }}>
                  <Send className="w-4 h-4" />
                </button>
              </ComposerPrimitive.Send>
            )}
          </ComposerPrimitive.Root>
          <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} agentMode={agentMode} onModeChange={setAgentMode} />
          {goalCondition && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(255,184,0,0.1)", border: "1px solid rgba(255,184,0,0.2)" }}>
              <span style={{ color: "#FFB800" }}>Goal:</span>
              <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{goalCondition}</span>
              <button onClick={() => setGoalCondition(null)} className="px-2 py-1 rounded-lg" style={{ color: "var(--text-secondary)" }}>清除</button>
            </div>
          )}
        </div>

      </div>

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
