import { useState, useRef, useEffect, useCallback } from "react";
import {
  AuiIf,
  ComposerPrimitive,
  ThreadPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  ErrorPrimitive,
  BranchPickerPrimitive,
  SelectionToolbarPrimitive,
  useAui,
  useAuiState,
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
import {
  FileUp,
  Sparkles,
  Copy,
  RotateCcw,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Square,
  Send,
} from "lucide-react";

interface Props {
  sessionId: string;
  onSessionChange?: (id: string) => void;
}

interface SkillInfo {
  name: string;
  description: string;
  category: string | null;
}

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
    window.electronAPI.agent.listSkills().then((list) => {
      setSkills(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const modes: AgentMode[] = ["assistant", "expert", "action", "safe", "plan"];
    const handleGlobalTab = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const textarea = document.querySelector("textarea");
        const isInputFocused = document.activeElement === textarea;
        const isEmpty = textarea?.value === "";
        if (!isInputFocused || isEmpty) {
          e.preventDefault();
          const currentIdx = modes.indexOf(agentMode);
          const nextIdx = (currentIdx + 1) % modes.length;
          const nextMode = modes[nextIdx];
          setAgentMode(nextMode);
          localStorage.setItem("chat_mode", nextMode);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalTab);
    return () => window.removeEventListener("keydown", handleGlobalTab);
  }, [agentMode, setAgentMode]);

  useEffect(() => {
    const handleSlashGoal = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        const textarea = document.querySelector("textarea");
        if (textarea && textarea.value.startsWith("/goal ")) {
          const condition = textarea.value.slice(6).trim();
          if (condition) {
            setGoalCondition(condition);
            textarea.value = "";
          }
        }
      }
    };
    window.addEventListener("keydown", handleSlashGoal);
    return () => window.removeEventListener("keydown", handleSlashGoal);
  }, []);

  return (
    <MiraRuntimeProvider
      sessionId={sessionId}
      selectedModel={selectedModel}
      agentMode={agentMode}
      goalCondition={goalCondition}
    >
      {(ctx) => (
        <ChatInner
          sessionId={sessionId}
          ctx={ctx}
          isFocused={isFocused}
          setIsFocused={setIsFocused}
          skills={skills}
          showSkills={showSkills}
          setShowSkills={setShowSkills}
          filteredSkills={filteredSkills}
          setFilteredSkills={setFilteredSkills}
          selectedSkillIndex={selectedSkillIndex}
          setSelectedSkillIndex={setSelectedSkillIndex}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          agentMode={agentMode}
          setAgentMode={setAgentMode}
          goalCondition={goalCondition}
          setGoalCondition={setGoalCondition}
        />
      )}
    </MiraRuntimeProvider>
  );
}

interface ChatInnerProps {
  sessionId: string;
  ctx: {
    messages: MiraMessage[];
    isRunning: boolean;
    sendMessage: (content: string) => Promise<void>;
    retryMessage: (assistantMsgId: string) => Promise<void>;
    permissionReq: {
      tool_name: string;
      args: Record<string, unknown>;
      reason: string;
      request_id: string;
      channel?: string;
    } | null;
    questionReq: {
      question: string;
      options: string[];
      request_id: string;
    } | null;
    handlePermission: (approved: boolean | "always") => Promise<void>;
    handleQuestionAnswer: (answer: string) => void;
    handleToolResult: (toolName: string, result: any) => void;
  };
  isFocused: boolean;
  setIsFocused: (v: boolean) => void;
  skills: SkillInfo[];
  showSkills: boolean;
  setShowSkills: (v: boolean) => void;
  filteredSkills: SkillInfo[];
  setFilteredSkills: (v: SkillInfo[]) => void;
  selectedSkillIndex: number;
  setSelectedSkillIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedModel: ModelOption;
  setSelectedModel: (m: ModelOption) => void;
  agentMode: AgentMode;
  setAgentMode: (m: AgentMode) => void;
  goalCondition: string | null;
  setGoalCondition: (v: string | null) => void;
}

function ChatInner({
  sessionId,
  ctx,
  isFocused,
  setIsFocused,
  skills,
  showSkills,
  setShowSkills,
  filteredSkills,
  setFilteredSkills,
  selectedSkillIndex,
  setSelectedSkillIndex,
  selectedModel,
  setSelectedModel,
  agentMode,
  setAgentMode,
  goalCondition,
  setGoalCondition,
}: ChatInnerProps) {
  const aui = useAui();
  const composerText = useAuiState((s) => s.composer.text);
  const composerIsEmpty = useAuiState((s) => s.composer.isEmpty);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const match = composerText.match(/^\/{1}(\w*)$/);
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
  }, [composerText, skills, setFilteredSkills, setShowSkills, setSelectedSkillIndex]);

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = (file as any).path || file.name;
      paths.push(filePath);
    }
    if (paths.length > 0) {
      aui.composer().setText(`读取文件: ${paths.join(", ")}`);
      textareaRef.current?.focus();
    }
  }, [aui]);

  useEffect(() => {
    const el = document.body;
    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("drop", handleDrop);
    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  function applySkill(skill: SkillInfo) {
    const prefix = `/${skill.name} `;
    aui.composer().setText(prefix);
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
  }

  return (
    <div className="flex flex-col h-full relative" style={{ background: "var(--surface)" }}>
      {isDragging && (
        <div className="absolute inset-0 z-50 glass-heavy border-2 border-dashed rounded-2xl flex items-center justify-center animate-fade-in-up"
          style={{ borderColor: 'rgba(0, 217, 192, 0.5)' }}>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'rgba(0, 217, 192, 0.1)' }}>
              <FileUp className="w-8 h-8" style={{ color: 'var(--accent-start)' }} />
            </div>
            <p className="text-lg font-semibold" style={{ color: 'var(--accent-start)' }}>释放以上传文件</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>支持任意文本文件</p>
          </div>
        </div>
      )}

      <ThreadPrimitive.Root className="flex flex-col flex-1 overflow-hidden">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
          {/* 干净的欢迎页 - 只有 Logo 和副标题 */}
          <AuiIf condition={(s) => s.thread.isEmpty && !!sessionId}>
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary-500/20">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold brand-glow tracking-tight mb-2">Mira</h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>有什么可以帮你的？</p>
              </div>
            </div>
          </AuiIf>

          <AuiIf condition={(s) => s.thread.isEmpty && !sessionId}>
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary-500/20">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold brand-glow tracking-tight mb-2">Mira</h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>选择一个会话开始</p>
              </div>
            </div>
          </AuiIf>

          <ThreadPrimitive.Messages>
            {({ message }) => {
              const origMsg = ctx.messages.find(m => m.id === message.id);
              return (
              <MessagePrimitive.Root className="group mb-5 animate-fade-in-up">
                {origMsg?.thinking && <ThinkingBlock text={origMsg.thinking} />}
                <div className={`flex w-full gap-3 ${message.role === "user" ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="shrink-0">
                    {message.role === "user" ? (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: "linear-gradient(135deg, #00B4A0, #0088A8)", color: "#ffffff" }}>
                        U
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>

                  <div className={`flex flex-col ${message.role === "user" ? 'items-end' : 'items-start'} max-w-[calc(100%-60px)]`}>
                    {message.role === "assistant" ? (
                      <div className="message-assistant px-5 py-4">
                        <MessagePrimitive.Parts>
                          {({ part }) => {
                            if (part.type === "text") {
                              const text = "text" in part ? (part as any).text : "";
                              return <MarkdownRenderer content={text} />;
                            }
                            return null;
                          }}
                        </MessagePrimitive.Parts>
                      </div>
                    ) : (
                      <div className="message-user px-5 py-4">
                        <MessagePrimitive.Parts>
                          {({ part }) => {
                            if (part.type === "text") {
                              const text = "text" in part ? (part as any).text : "";
                              return <p className="text-sm whitespace-pre-wrap" style={{ color: '#ffffff', lineHeight: '1.6' }}>{text}</p>;
                            }
                            return null;
                          }}
                        </MessagePrimitive.Parts>
                      </div>
                    )}

                    <MessagePrimitive.Error>
                      <ErrorPrimitive.Root className="mt-2 flex items-center gap-2 rounded-md bg-red-900/20 border border-red-500/20 px-3 py-2 text-xs text-red-400" role="alert">
                        <ErrorPrimitive.Message />
                      </ErrorPrimitive.Root>
                    </MessagePrimitive.Error>

                    {message.role === "assistant" && <MessageTimingDisplay />}

                    <div className="flex items-center justify-between mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <BranchPickerPrimitive.Root hideWhenSingleBranch className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        <BranchPickerPrimitive.Previous className="flex size-5 items-center justify-center rounded hover:bg-neutral-700/50 disabled:opacity-30">
                          <ChevronLeft className="w-3 h-3" />
                        </BranchPickerPrimitive.Previous>
                        <span className="tabular-nums">
                          <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
                        </span>
                        <BranchPickerPrimitive.Next className="flex size-5 items-center justify-center rounded hover:bg-neutral-700/50 disabled:opacity-30">
                          <ChevronRight className="w-3 h-3" />
                        </BranchPickerPrimitive.Next>
                      </BranchPickerPrimitive.Root>

                      {message.role === "assistant" && (
                        <ActionBarPrimitive.Root className="flex gap-1 justify-start">
                          <ActionBarPrimitive.Copy asChild>
                            <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] btn-ghost transition-all duration-200">
                              <Copy className="w-3 h-3" />
                              <span>复制</span>
                            </button>
                          </ActionBarPrimitive.Copy>
                          <button
                            onClick={() => ctx.retryMessage(message.id as string)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] btn-ghost transition-all duration-200"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>重试</span>
                          </button>
                          <ActionBarPrimitive.Edit asChild>
                            <button className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] btn-ghost transition-all duration-200">
                              <Pencil className="w-3 h-3" />
                              <span>编辑</span>
                            </button>
                          </ActionBarPrimitive.Edit>
                        </ActionBarPrimitive.Root>
                      )}
                    </div>
                  </div>
                </div>
              </MessagePrimitive.Root>
            );
            }}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>

        <SelectionToolbarPrimitive.Root className="flex items-center gap-1 rounded-lg border px-1 py-1 shadow-lg z-50"
          style={{ background: 'var(--selection-toolbar-bg)', borderColor: 'var(--selection-toolbar-border)' }}>
          <SelectionToolbarPrimitive.Quote className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors duration-200"
            style={{ color: 'var(--text-secondary)' }}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
            </svg>
            引用
          </SelectionToolbarPrimitive.Quote>
        </SelectionToolbarPrimitive.Root>

        {ctx.questionReq && (
          <QuestionDialog question={ctx.questionReq.question} options={ctx.questionReq.options} onSubmit={ctx.handleQuestionAnswer} />
        )}

        {ctx.permissionReq && (
          <PermissionDialog
            toolName={ctx.permissionReq.tool_name}
            args={ctx.permissionReq.args}
            reason={ctx.permissionReq.reason}
            onAllow={() => ctx.handlePermission(true)}
            onDeny={() => ctx.handlePermission(false)}
            onAlways={ctx.permissionReq.channel ? () => ctx.handlePermission("always") : undefined}
          />
        )}

        {/* 输入区域 */}
        <div className="p-4 w-full" style={{ maxWidth: "800px", margin: "0 auto", borderTop: "1px solid var(--border-light)" }}>
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
                        : "hover:bg-neutral-800/50"
                    }`}
                    style={{ color: idx === selectedSkillIndex ? undefined : 'var(--text-secondary)' }}
                    onMouseDown={() => applySkill(skill)}
                  >
                    <span className="font-medium" style={{ color: 'var(--accent-start)' }}>/</span>
                    <span>{skill.name}</span>
                    {skill.category && (
                      <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{skill.category}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ComposerPrimitive.Root
            className="relative flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-200"
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: isFocused ? '1px solid rgba(0, 217, 192, 0.5)' : '1px solid var(--input-border)',
              boxShadow: isFocused ? '0 0 0 3px rgba(0, 217, 192, 0.15)' : 'none',
            }}
          >
            <ComposerPrimitive.Input
              ref={textareaRef}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="输入消息..."
              rows={1}
              className="flex-1 bg-transparent text-sm outline-none resize-none leading-relaxed min-h-[24px] max-h-[200px]"
              style={{ lineHeight: '1.6', color: 'var(--text-primary)' }}
            />

            {/* 发送/暂停按钮 - 根据状态切换 */}
            {ctx.isRunning ? (
              <ComposerPrimitive.Cancel asChild>
                <button
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
                  style={{ background: "rgba(255, 71, 87, 0.15)", color: "#FF4757" }}
                  title="停止生成"
                >
                  <Square className="w-4 h-4" fill="currentColor" />
                </button>
              </ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send asChild>
                <button
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: !composerIsEmpty ? 'linear-gradient(135deg, var(--accent-start), var(--accent-end))' : 'var(--chip-bg)',
                    color: !composerIsEmpty ? '#ffffff' : 'var(--text-secondary)',
                    boxShadow: !composerIsEmpty ? '0 2px 8px rgba(0, 217, 192, 0.3)' : 'none',
                  }}
                  title="发送消息"
                >
                  <Send className="w-4 h-4" />
                </button>
              </ComposerPrimitive.Send>
            )}
          </ComposerPrimitive.Root>

          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            agentMode={agentMode}
            onModeChange={setAgentMode}
          />

          {goalCondition && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255, 184, 0, 0.1)', border: '1px solid rgba(255, 184, 0, 0.2)' }}>
              <span style={{ color: '#FFB800' }}>🎯</span>
              <span className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{goalCondition}</span>
              <button onClick={() => setGoalCondition(null)}
                className="px-2 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}>
                清除
              </button>
            </div>
          )}
        </div>
      </ThreadPrimitive.Root>
    </div>
  );
}

export function ChatWindow({ sessionId, onSessionChange }: Props) {
  return <ChatContent sessionId={sessionId} />;
}
