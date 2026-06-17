import { useState, useRef, useEffect, useCallback } from "react";
import {
  AuiIf,
  ComposerPrimitive,
  ThreadPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { MiraRuntimeProvider } from "./MiraRuntimeProvider";
import { ModelSelector, loadModelChoice, loadModeChoice } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import type { AgentMode } from "./types";
import { PermissionDialog } from "./PermissionDialog";
import { QuestionDialog } from "./QuestionDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  FileUp,
  Sparkles,
  Code,
  Image,
  Search,
  FileText,
  Globe,
  BarChart3,
  Clock,
  Calendar,
  FolderOpen,
  Copy,
  Check,
  Plus,
} from "lucide-react";

interface Props {
  sessionId: string;
  onSessionChange?: (id: string) => void;
}

const features = [
  { icon: FolderOpen, label: "文件管理", color: "#00D9C0" },
  { icon: Code, label: "代码开发", color: "#00A8E8" },
  { icon: Globe, label: "网页搜索", color: "#A371F7" },
  { icon: BarChart3, label: "数据分析", color: "#FFB800" },
  { icon: Image, label: "图像生成", color: "#FF7A45" },
  { icon: Clock, label: "定时任务", color: "#FF4757" },
  { icon: Calendar, label: "项目管理", color: "#3FB950" },
];

const quickActions = [
  { icon: Code, label: "分析代码", prompt: "请帮我分析这段代码" },
  { icon: Image, label: "生成图片", prompt: "帮我生成一张图片" },
  { icon: Search, label: "网页搜索", prompt: "帮我搜索" },
  { icon: FileText, label: "读取文件", prompt: "请读取这个文件" },
];

interface SkillInfo {
  name: string;
  description: string;
  category: string | null;
}

function ChatContent({ sessionId }: { sessionId: string }) {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(loadModelChoice);
  const [agentMode, setAgentMode] = useState<AgentMode>(loadModeChoice);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
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

  // Tab 键切换 Agent 模式（全局）
  useEffect(() => {
    const modes: AgentMode[] = ["assistant", "expert", "action", "safe", "plan"];
    const modeLabels: Record<AgentMode, string> = {
      assistant: "助手",
      expert: "专家",
      action: "执行",
      safe: "安全",
      plan: "规划",
    };

    const handleGlobalTab = (e: KeyboardEvent) => {
      // Tab 切换模式：仅在输入框为空或未聚焦时触发
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const textarea = document.querySelector("textarea");
        const isInputFocused = document.activeElement === textarea;
        const isEmpty = textarea?.value === "";

        // 允许 Tab 切换的条件：输入框未聚焦，或输入框为空
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

  // /goal 命令处理
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

  // 拖放处理移至 ChatInner

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
          copiedMsgId={copiedMsgId}
          setCopiedMsgId={setCopiedMsgId}
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
    isRunning: boolean;
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
  copiedMsgId: string | null;
  setCopiedMsgId: (id: string | null) => void;
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
  copiedMsgId,
  setCopiedMsgId,
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

  const handleCopyMessage = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsgId("copied");
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch { /* ignore */ }
  }, [setCopiedMsgId]);

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
    <div className="flex flex-col h-full relative" style={{ background: "#0A0F14" }}>
      {isDragging && (
        <div className="absolute inset-0 z-50 glass-heavy border-2 border-dashed border-primary-500/50 rounded-2xl flex items-center justify-center animate-fade-in-up">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto">
              <FileUp className="w-8 h-8 text-primary-400" />
            </div>
            <p className="text-primary-300 text-lg font-semibold">释放以上传文件</p>
            <p className="text-primary-400/60 text-sm">支持任意文本文件</p>
          </div>
        </div>
      )}

      <ThreadPrimitive.Root className="flex flex-col flex-1 overflow-hidden">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar" style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
          <AuiIf condition={(s) => s.thread.isEmpty && !!sessionId}>
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-2xl">
                <div className="mb-6">
                  <h1 className="text-brand font-bold brand-glow tracking-tight mb-3">Mira</h1>
                  <p className="text-body text-neutral-500">你的 AI 桌面助手</p>
                </div>
                <div className="flex items-center justify-center gap-3 mb-8 overflow-x-auto pb-2 px-4">
                  {features.map(({ icon: Icon, label, color }) => (
                    <div key={label} className="chip flex items-center gap-2 px-4 py-2 rounded-button whitespace-nowrap cursor-default">
                      <Icon className="w-4 h-4" style={{ color }} />
                      <span className="text-xs font-medium">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-4 mb-8 max-w-lg mx-auto">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shrink-0 shadow-lg shadow-primary-500/20">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="message-assistant px-5 py-4 text-left">
                    <p className="text-body text-neutral-200">
                      你好！我是 Mira，你的 AI 桌面助手。我可以帮你处理文件、编写代码、搜索信息、分析数据等。有什么我可以帮你的吗？
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-8 max-w-lg mx-auto">
                  {quickActions.map(({ icon: Icon, label, prompt }) => (
                    <button
                      key={label}
                      onClick={() => {
                        aui.composer().setText(prompt);
                        textareaRef.current?.focus();
                      }}
                      className="flex items-center gap-3 p-4 rounded-card transition-all duration-200 hover:scale-[1.02] hover:shadow-card-hover text-left group"
                      style={{ background: "#0F1A20", border: "1px solid #1A2E35" }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors" style={{ background: "rgba(0, 217, 192, 0.1)" }}>
                        <Icon className="w-5 h-5 text-primary-400 group-hover:text-primary-300 transition-colors" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-200 group-hover:text-neutral-100 transition-colors">{label}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">点击快速开始</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-4 text-caption text-neutral-600">
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-2 py-0.5 rounded-md font-mono text-[10px]" style={{ background: "#1A2E35", color: "#5C8D8A", border: "1px solid #2A4A50" }}>Enter</kbd> 发送
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-2 py-0.5 rounded-md font-mono text-[10px]" style={{ background: "#1A2E35", color: "#5C8D8A", border: "1px solid #2A4A50" }}>Shift+Enter</kbd> 换行
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-2 py-0.5 rounded-md font-mono text-[10px]" style={{ background: "#1A2E35", color: "#5C8D8A", border: "1px solid #2A4A50" }}>/</kbd> 命令
                  </span>
                </div>
              </div>
            </div>
          </AuiIf>

          <AuiIf condition={(s) => s.thread.isEmpty && !sessionId}>
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-2xl">
                <h1 className="text-brand font-bold brand-glow tracking-tight mb-3">Mira</h1>
                <p className="text-body text-neutral-500">工具模式 · 选择会话开始</p>
              </div>
            </div>
          </AuiIf>

          <ThreadPrimitive.Messages>
            {({ message }) => (
              <MessagePrimitive.Root className="mb-5 animate-fade-in-up">
                <div className={`flex w-full gap-3 ${message.role === "user" ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="shrink-0">
                    {message.role === "user" ? (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: "linear-gradient(135deg, #00B4A0, #0088A8)", color: "#ffffff" }}
                      >
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
                              return <p className="text-body whitespace-pre-wrap">{text}</p>;
                            }
                            return null;
                          }}
                        </MessagePrimitive.Parts>
                      </div>
                    )}

                    {message.role === "assistant" && (
                      <div className="flex gap-1 mt-1 justify-start">
                        <button
                          onClick={() => {
                            const text = message.content.map((p: any) => p.type === "text" ? p.text : "").join("");
                            handleCopyMessage(text);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] btn-ghost transition-all duration-200"
                          title="复制"
                        >
                          {copiedMsgId === "copied" ? (
                            <><Check className="w-3 h-3 text-success" /><span className="text-success">已复制</span></>
                          ) : (
                            <><Copy className="w-3 h-3" /><span>复制</span></>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </MessagePrimitive.Root>
            )}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>

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

        <div className="p-4 w-full" style={{ maxWidth: "960px", margin: "0 auto", borderTop: "1px solid #15252A" }}>
          {showSkills && (
            <div className="absolute bottom-full mb-2 left-0 right-0 z-50 rounded-xl overflow-hidden shadow-glass-lg"
              style={{ background: '#0F1A20', border: '1px solid #1A2E35' }}>
              <div className="px-4 py-2 text-[10px] font-medium text-neutral-500" style={{ borderBottom: '1px solid #1A2E35' }}>
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

          <ComposerPrimitive.Root
            className="relative flex items-end gap-3 rounded-2xl px-4 py-3 transition-all duration-200"
            style={{
              background: 'rgba(15, 26, 32, 0.9)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: isFocused ? '1px solid rgba(0, 217, 192, 0.5)' : '1px solid #1A2E35',
              boxShadow: isFocused ? '0 0 0 3px rgba(0, 217, 192, 0.15)' : 'none',
            }}
          >
            <button
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:bg-neutral-700/50"
              style={{ color: '#5C8D8A' }}
              title="添加附件"
            >
              <Plus className="w-5 h-5" />
            </button>

            <ComposerPrimitive.Input
              ref={textareaRef}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="输入消息... (/ 查看 Skill, Shift+Enter 换行)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none resize-none leading-relaxed min-h-[24px] max-h-[200px]"
              style={{ lineHeight: '1.6' }}
            />

            {ctx.isRunning ? (
              <ComposerPrimitive.Cancel asChild>
                <button
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
                  style={{ background: "rgba(255, 71, 87, 0.1)", color: "#FF4757" }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="4" y="4" width="8" height="8" rx="1" />
                  </svg>
                </button>
              </ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send asChild>
                <button
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
                  style={{
                    background: !composerIsEmpty ? 'linear-gradient(135deg, #00D9C0, #00A8E8)' : '#1A2E35',
                    color: !composerIsEmpty ? '#ffffff' : '#5C8D8A',
                    boxShadow: !composerIsEmpty ? '0 2px 8px rgba(0, 217, 192, 0.3)' : 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
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

          {/* Goal 条件指示器 */}
          {goalCondition && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255, 184, 0, 0.1)', border: '1px solid rgba(255, 184, 0, 0.2)' }}>
              <span style={{ color: '#FFB800' }}>🎯</span>
              <span style={{ color: '#FFB800' }}>Goal:</span>
              <span className="flex-1 truncate" style={{ color: '#E8F4F0' }}>{goalCondition}</span>
              <button onClick={() => setGoalCondition(null)}
                className="px-2 py-1 rounded-lg transition-colors hover:bg-neutral-700/50"
                style={{ color: '#5C8D8A' }}>
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
