import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  AuiIf, ComposerPrimitive, ThreadPrimitive, MessagePrimitive,
  ActionBarPrimitive, ErrorPrimitive, BranchPickerPrimitive,
  SelectionToolbarPrimitive,
  useAui, useAuiState,
} from "@assistant-ui/react";
import { MiraRuntimeProvider } from "./MiraRuntimeProvider";
import { ModelSelector, loadModelChoice, loadModeChoice } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import type { AgentMode } from "./types";
import type { MiraMessage } from "./mira-runtime";
import { PermissionDialog } from "./PermissionDialog";
import { QuestionDialog } from "./QuestionDialog";
import { MarkdownText } from "../components/assistant-ui/markdown-text";
import { MessageTiming } from "../components/assistant-ui/message-timing";
import { ContextDisplay } from "../components/assistant-ui/context-display";
import { ThinkingBlock } from "./ThinkingBlock";
import { ProgressBar } from "./ProgressBar";
import { RenderMessageParts, findDiffSummary } from "./ToolCallView";
import { loadSettings } from "../sidebar/provider-data";
import { Copy, RotateCcw, Edit3, Square, Send, Paperclip, FileUp, ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";
import { AnimatedAvatar, type AvatarState } from "../components/assistant-ui/animated-avatar";
import "../components/assistant-ui/animated-avatar.css";
import { Live2DAvatar } from "../components/assistant-ui/live2d-avatar";
import { VoiceInput } from "./VoiceInput";
import { ToolCallView } from "./ToolCallView";
import type { MiraRuntimeContext } from "./MiraRuntimeProvider";
import { AgentService } from "../services/agent.service";

interface Props { sessionId: string; onSessionChange?: (id: string) => void; }
interface SkillInfo { name: string; description: string; category: string | null; }

function WelcomeScreen({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
      <div className="mb-8">
        <Live2DAvatar state="idle" size={120} />
      </div>
      <h1 className="text-2xl font-semibold mb-2" style={{ color: "var(--fg)" }}>Mira</h1>
      <p className="text-sm mb-10" style={{ color: "var(--fg-tertiary)" }}>有什么可以帮助你的？</p>
      <div className="flex flex-wrap justify-center gap-2 max-w-sm">
        {["写作", "编程", "分析数据", "搜索信息"].map((label) => (
          <button key={label} onClick={() => onSuggest(label)}
            className="px-4 py-2 text-xs rounded-full transition-all hover:scale-105"
            style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)" }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageActions({ messageId, ctx }: { messageId: string; ctx: MiraRuntimeContext }) {
  return (
    <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <BranchPickerPrimitive.Root hideWhenSingleBranch className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--fg-tertiary)" }}>
        <BranchPickerPrimitive.Previous className="flex size-6 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30">
          <ChevronLeft className="w-3 h-3" />
        </BranchPickerPrimitive.Previous>
        <span className="tabular-nums"><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
        <BranchPickerPrimitive.Next className="flex size-6 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30">
          <ChevronRight className="w-3 h-3" />
        </BranchPickerPrimitive.Next>
      </BranchPickerPrimitive.Root>
      <div className="w-px h-3 mx-1" style={{ background: "var(--border-subtle)" }} />
      <ActionBarPrimitive.Copy asChild>
        <button className="btn-ghost" style={{ width: 28, height: 28, padding: 0 }} title="复制"><Copy className="w-3 h-3" /></button>
      </ActionBarPrimitive.Copy>
      <button onClick={() => ctx.retryMessage(messageId)} className="btn-ghost" style={{ width: 28, height: 28, padding: 0 }} title="重试"><RotateCcw className="w-3 h-3" /></button>
      <ActionBarPrimitive.Edit asChild>
        <button className="btn-ghost" style={{ width: 28, height: 28, padding: 0 }} title="编辑"><Edit3 className="w-3 h-3" /></button>
      </ActionBarPrimitive.Edit>
      <MessageTiming />
    </div>
  );
}

function ChatInner({ ctx, selectedModel, onModelChange, agentMode, onModeChange, goalCondition, setGoalCondition }: {
  ctx: MiraRuntimeContext; selectedModel: ModelOption; onModelChange: (m: ModelOption) => void;
  agentMode: AgentMode; onModeChange: (m: AgentMode) => void;
  goalCondition: string | null; setGoalCondition: (v: string | null) => void;
}) {
  const aui = useAui();
  const composerText = useAuiState((s) => s.composer.text);
  const composerIsEmpty = useAuiState((s) => s.composer.isEmpty);
  const threadEmpty = useAuiState((s) => s.thread.isEmpty);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [filteredSkills, setFilteredSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const settings = useMemo(() => loadSettings(), []);

  useEffect(() => { AgentService.listSkills().then((l) => setSkills(l)).catch(() => {}); }, []);
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
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg)" }}>
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto" style={{ border: "2px dashed rgba(255,255,255,0.3)" }}>
              <FileUp className="w-10 h-10" style={{ color: "rgba(255,255,255,0.6)" }} />
            </div>
            <p className="text-lg font-medium text-white">释放以上传文件</p>
          </div>
        </div>
      )}

      {settings.showProgressBar !== false && ctx.isRunning && <ProgressBar />}

      <ThreadPrimitive.Root className="flex-1 flex flex-col min-h-0">
        <ThreadPrimitive.Viewport className={`flex-1 overflow-x-hidden min-h-0 ${threadEmpty ? "overflow-y-hidden" : "overflow-y-auto scrollbar-custom"}`}>
          <div className="flex flex-col mx-auto py-6 min-h-full px-6" style={{ maxWidth: "760px", width: "100%" }}>
            <AuiIf condition={(s) => s.thread.isEmpty}>
              <WelcomeScreen onSuggest={(text) => { aui.composer().setText(text); textareaRef.current?.focus(); }} />
              <div className="flex flex-wrap justify-center gap-2 max-w-sm mx-auto mt-2">
                <ThreadPrimitive.Suggestions>
                  {({ suggestion }) => (
                    <ThreadPrimitive.Suggestion
                      prompt={suggestion.prompt}
                      send
                      className="px-4 py-2 text-xs rounded-full transition-all hover:scale-105 cursor-pointer"
                      style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)", border: "none" }}
                    />
                  )}
                </ThreadPrimitive.Suggestions>
              </div>
            </AuiIf>

            <ThreadPrimitive.Messages>
              {({ message }) => {
                const orig = ctx.messages.find((m: any) => m.id === message.id);
                const isUser = message.role === "user";
                const isLast = ctx.isRunning && message.id === ctx.messages[ctx.messages.length - 1]?.id;
                const avatarState: AvatarState = !isUser
                  ? isLast ? "speaking" : "idle"
                  : "idle";
                const thinkingParts = orig?.parts.filter((p: any) => p.type === "thinking") || [];
                const hasToolCalls = orig?.parts.some((p: any) => p.type === "tool-call");
                const diffSummaryPart = orig ? findDiffSummary(orig) : null;
                const hasCustomParts = hasToolCalls || diffSummaryPart;
                return (
                  <MessagePrimitive.Root className="group mb-5 animate-message">
                    {thinkingParts.length > 0 && settings.showReasoning !== false && thinkingParts.map((p: any, i: number) => (
                      <ThinkingBlock key={i} text={p.text || ""} />
                    ))}
                    <div className={`flex w-full gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                      {!isUser && (
                        <div className="shrink-0 mt-1">
                          <AnimatedAvatar state={avatarState} size={28} />
                        </div>
                      )}
                      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[calc(100%-44px)]`}>
                        {isUser ? (
                          <div className="bubble-user">
                            <MessagePrimitive.Parts>
                              {({ part }) => { if (part.type === "text") return <p className="whitespace-pre-wrap">{part.text}</p>; return null; }}
                            </MessagePrimitive.Parts>
                          </div>
                        ) : (
                          <div className="bubble-assistant">
                            <MessagePrimitive.Parts>
                              {({ part }) => { if (part.type === "text") return <MarkdownText />; return null; }}
                            </MessagePrimitive.Parts>
                            {hasCustomParts && orig && (
                              <div className="mt-2 space-y-1.5">
                                <RenderMessageParts message={orig} />
                              </div>
                            )}
                            <SelectionToolbarPrimitive.Root>
                              <SelectionToolbarPrimitive.Quote
                                className="btn-ghost text-[11px]"
                                style={{ padding: "4px 8px" }}
                              />
                            </SelectionToolbarPrimitive.Root>
                          </div>
                        )}
                        <MessagePrimitive.Error>
                          <ErrorPrimitive.Root className="mt-2 rounded-md px-3 py-2 text-xs" style={{ background: "rgba(239,68,68,0.08)", color: "var(--error)" }}>
                            <ErrorPrimitive.Message />
                          </ErrorPrimitive.Root>
                        </MessagePrimitive.Error>
                        {!isUser && <MessageActions messageId={message.id} ctx={ctx} />}
                      </div>
                    </div>
                  </MessagePrimitive.Root>
                );
              }}
            </ThreadPrimitive.Messages>
            <div className="h-4" />
          </div>

          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 z-10" style={{ background: "linear-gradient(to top, var(--bg) 60%, transparent)" }}>
            <div className="mx-auto px-6 pb-4 pt-2" style={{ maxWidth: "760px" }}>
              {showSkills && (
                <div className="mb-3 rounded-xl overflow-hidden" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-elevated)" }}>
                  <div className="px-3 py-1.5 text-[10px] font-medium" style={{ color: "var(--fg-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>Skill 命令 — 回车选择</div>
                  <div className="max-h-48 overflow-y-auto scrollbar-custom">
                    {filteredSkills.map((skill, idx) => (
                      <button key={skill.name} onMouseDown={() => applySkill(skill)}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${idx === selectedSkillIndex ? "bg-primary-500/10" : ""}`}
                        style={{ color: idx === selectedSkillIndex ? "var(--accent)" : "var(--fg-secondary)" }}>
                        <span className="font-mono font-medium" style={{ color: "var(--accent)" }}>/</span>
                        <span className="font-medium">{skill.name}</span>
                        {skill.category && <span className="text-[10px] ml-auto" style={{ color: "var(--fg-tertiary)" }}>{skill.category}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 rounded-xl px-4 py-3 transition-all duration-200"
                  style={{ background: "var(--bg-elevated)", border: "1px solid", borderColor: isFocused ? "var(--fg)" : "var(--border)", boxShadow: isFocused ? "var(--shadow-elevated)" : "none" }}>
                  <ComposerPrimitive.Quote className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-light)" }}>
                    <ComposerPrimitive.QuoteText className="flex-1 truncate" />
                    <ComposerPrimitive.QuoteDismiss className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
                      style={{ color: "var(--text-tertiary)" }}>
                      ✕
                    </ComposerPrimitive.QuoteDismiss>
                  </ComposerPrimitive.Quote>
                  <div className="flex items-center gap-2">
                   <button className="btn-ghost" style={{ width: 28, height: 28, padding: 0 }} title="添加附件">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <ComposerPrimitive.Dictate asChild>
                    <button className="btn-ghost" style={{ width: 28, height: 28, padding: 0 }} title="语音输入">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
                      </svg>
                    </button>
                  </ComposerPrimitive.Dictate>
                  <ComposerPrimitive.DictationTranscript className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-secondary)", color: "var(--fg-secondary)" }} />
                  <ComposerPrimitive.Queue>
                    <button className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono"
                      style={{ background: "rgba(6,182,212,0.1)", color: "var(--accent)" }}>
                      <ListOrdered className="w-3 h-3" />
                      <span>排队中</span>
                    </button>
                  </ComposerPrimitive.Queue>
                  <ComposerPrimitive.Input ref={textareaRef} onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
                    placeholder="输入消息..." rows={1}
                    className="input-field min-h-[24px] max-h-[200px]" />
                  <ComposerPrimitive.Cancel asChild>
                    <button className="btn-ghost" style={{ width: 28, height: 28, padding: 0, background: "rgba(239,68,68,0.08)", color: "var(--error)" }}>
                      <Square className="w-3.5 h-3.5" fill="currentColor" />
                    </button>
                  </ComposerPrimitive.Cancel>
                  <ComposerPrimitive.Send asChild>
                    <button className="btn-ghost" style={{ width: 28, height: 28, padding: 0, color: composerIsEmpty ? "var(--fg-tertiary)" : "var(--fg)" }}>
                      <Send className="w-4 h-4" />
                    </button>
                  </ComposerPrimitive.Send>
                </div>
                </div>

                <div className="flex items-center justify-between">
                  <ModelSelector selectedModel={selectedModel} onModelChange={onModelChange} agentMode={agentMode} onModeChange={onModeChange} />
                  <div className="flex items-center gap-2">
                    {ctx.isRunning && ctx.liveTiming && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono"
                        style={{ background: "rgba(6,182,212,0.08)", color: "var(--accent)" }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        <span>{ctx.liveTiming.tokenCount} tok</span>
                        {ctx.liveTiming.firstTokenTime && (
                          <span>
                            {((ctx.liveTiming.tokenCount / (Date.now() - ctx.liveTiming.streamStartTime)) * 1000).toFixed(1)} t/s
                          </span>
                        )}
                      </div>
                    )}
                    <ContextDisplay />
                  </div>
                </div>

                {goalCondition && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(255,184,0,0.06)", border: "1px solid rgba(255,184,0,0.12)" }}>
                    <span className="font-medium" style={{ color: "#d4a017" }}>Goal</span>
                    <span className="flex-1 truncate" style={{ color: "var(--fg)" }}>{goalCondition}</span>
                    <button onClick={() => setGoalCondition(null)} className="btn-ghost" style={{ height: 22, padding: "0 8px", fontSize: 11 }}>清除</button>
                  </div>
                )}
              </div>
            </div>
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      {ctx.questionReq && <QuestionDialog question={ctx.questionReq.question} options={ctx.questionReq.options} onSubmit={ctx.handleQuestionAnswer} />}
      {ctx.permissionReq && (
        <PermissionDialog toolName={ctx.permissionReq.tool_name} args={ctx.permissionReq.args} reason={ctx.permissionReq.reason}
          onAllow={() => ctx.handlePermission(true)} onDeny={() => ctx.handlePermission(false)}
          onAlways={ctx.permissionReq.channel ? () => ctx.handlePermission("always") : undefined} />
      )}
    </div>
  );
}

function ChatContent({ sessionId, onSessionChange }: { sessionId: string; onSessionChange?: (id: string) => void }) {
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
    <MiraRuntimeProvider sessionId={sessionId} selectedModel={selectedModel} agentMode={agentMode} goalCondition={goalCondition} onSessionChange={onSessionChange}>
      {(ctx) => (
        <ChatInner ctx={ctx} selectedModel={selectedModel} onModelChange={setSelectedModel}
          agentMode={agentMode} onModeChange={setAgentMode}
          goalCondition={goalCondition} setGoalCondition={setGoalCondition} />
      )}
    </MiraRuntimeProvider>
  );
}

export function ChatWindow({ sessionId, onSessionChange }: Props) {
  return <ChatContent key={sessionId} sessionId={sessionId} onSessionChange={onSessionChange} />;
}
