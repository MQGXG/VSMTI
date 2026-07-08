import {
  FileText, Terminal, Globe, Code2, Search, GitBranch,
  Database, Image as ImageIcon, FileEdit, Braces, MessageSquare,
  Clock, Workflow, Users, UserPlus, ListTodo, LucideIcon,
} from "lucide-react";

const toolIconMap: Record<string, LucideIcon> = {
  read_file: FileText,
  list_files: FileText,
  write_file: FileEdit,
  edit_file: FileEdit,
  apply_patch: FileEdit,
  bash: Terminal,
  code_exec: Code2,
  web_search: Globe,
  web_browse: Globe,
  web_fetch: Globe,
  grep: Search,
  glob: Search,
  code_search: Search,
  search_history: Search,
  git_status: GitBranch,
  git_diff: GitBranch,
  git_log: GitBranch,
  git_commit: GitBranch,
  data_analysis: Database,
  image_gen: ImageIcon,
  create_docx: FileText,
  memory_search: Database,
  memory_recall: Database,
  lsp_definition: Braces,
  lsp_references: Braces,
  lsp_hover: Braces,
  create_mcp: Braces,
  question: MessageSquare,
  delegate_task: UserPlus,
  spawn_agent: UserPlus,
  wait_agents: UserPlus,
  list_subagents: Users,
  team_tool: Users,
  task_planner: ListTodo,
  cron_tool: Clock,
  worktree_tool: GitBranch,
  workflow_run: Workflow,
  skills_list: ListTodo,
  skill_view: ListTodo,
};

const defaultIcon: LucideIcon = Braces;

export function getToolIcon(toolName: string): LucideIcon {
  return toolIconMap[toolName] || defaultIcon;
}

export function getToolColor(toolName: string): string {
  if (["read_file", "list_files", "glob", "grep", "code_search"].includes(toolName)) {
    return "var(--accent)";
  }
  if (["bash", "code_exec"].includes(toolName)) {
    return "#d97706"; // amber
  }
  if (["web_search", "web_browse", "web_fetch"].includes(toolName)) {
    return "#3b82f6"; // blue
  }
  if (["write_file", "edit_file", "apply_patch"].includes(toolName)) {
    return "#10b981"; // emerald
  }
  if (["image_gen", "data_analysis"].includes(toolName)) {
    return "#8b5cf6"; // violet
  }
  return "var(--fg-tertiary)";
}
