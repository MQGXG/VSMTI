/**
 * @mira/ui - Mira UI 组件包
 *
 * 包含所有 React UI 组件
 */

// ─── 通用 UI 组件 ──────────────────────────────────────────────
export { Modal } from "./ui/Modal"
export { ResizablePanel } from "./ui/ResizablePanel"

// ─── 聊天组件 ──────────────────────────────────────────────────
export { ChatWindow } from "./chat/ChatWindow"
export { MiraRuntimeProvider } from "./chat/MiraRuntimeProvider"
export { ModelSelector } from "./chat/ModelSelector"
export { PermissionDialog } from "./chat/PermissionDialog"
export { QuestionDialog } from "./chat/QuestionDialog"
export { MarkdownRenderer } from "./chat/MarkdownRenderer"
export { CodeBlock } from "./chat/CodeBlock"
export { ThinkingBlock } from "./chat/ThinkingBlock"
export { ToolCallView } from "./chat/ToolCallView"
export { ToolPalette } from "./chat/ToolPalette"
export { VoiceInput } from "./chat/VoiceInput"
export { MiraLogo } from "./chat/MiraLogo"
export { MessageTimingDisplay } from "./chat/MessageTimingDisplay"
export { MermaidBlock } from "./chat/MermaidBlock"

// ─── 侧边栏组件 ───────────────────────────────────────────────
export { Sidebar } from "./sidebar/Sidebar"
export { SettingsDialog } from "./sidebar/SettingsDialog"
export { ModelManager } from "./sidebar/ModelManager"
export { ProjectBar } from "./sidebar/ProjectBar"
export { ThemeSelector } from "./sidebar/ThemeSelector"
export { ProviderConfigPanel } from "./sidebar/ProviderConfigPanel"

// ─── 布局组件 ──────────────────────────────────────────────────
export { TitleBar } from "./layout/TitleBar"

// ─── React Hooks ───────────────────────────────────────────────
export { useMiraChat } from "./hooks/useMiraChat"

// ─── 主题上下文 ────────────────────────────────────────────────
export { ThemeProvider, useTheme } from "./contexts/ThemeContext"

// ─── 类型定义 ──────────────────────────────────────────────────
export type { AgentMode } from "@mira/core/modes"
