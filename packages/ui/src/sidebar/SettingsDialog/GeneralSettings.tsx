import { ThemeSelector } from "../ThemeSelector";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

interface Props {
  settings: Record<string, any>;
  onUpdate: (patch: Record<string, any>) => void;
}

const timelineSettings = [
  { key: "showReasoning", label: "显示推理摘要", desc: "在时间线中显示模型推理摘要" },
  { key: "expandShellTools", label: "展开 Shell 工具", desc: "默认在时间线中展开 shell 工具部分" },
  { key: "expandEditTools", label: "展开编辑工具", desc: "默认在时间线中展开 edit、write 和 patch 工具部分" },
] as const;

const toggleSettings = [
  { key: "maxMode", label: "增强模式（Max Mode）", desc: "并行生成多个候选方案，选最优执行。提升复杂任务质量，但消耗更多 token" },
  { key: "showProgressBar", label: "显示会话进度条", desc: "当智能体正在工作时，在会话顶部显示动画进度条" },
] as const;

export function GeneralSettings({ settings, onUpdate }: Props) {
  return (
    <div className="max-w-2xl space-y-6">
      <h3 className="text-lg font-medium text-primary">通用设置</h3>
      <ThemeSelector />

      <div className="p-4 rounded-xl bg-surface-secondary border border-standard">
        <div className="text-sm mb-3 text-primary">权限</div>
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-sm text-primary">自动接受权限</div>
            <div className="text-xs mt-0.5 text-secondary">允许 Agent 自动执行操作，不再弹出确认对话框</div>
          </div>
          <Switch checked={settings.autoAcceptPermissions}
            onCheckedChange={(v) => onUpdate({ autoAcceptPermissions: v })} />
        </label>
      </div>

      <div className="p-4 rounded-xl bg-surface-secondary border border-standard">
        <div className="text-sm mb-3 text-primary">终端</div>
        <label className="text-xs mb-1 block text-secondary">默认 Shell</label>
        <Select value={settings.terminalShell}
          onValueChange={(v) => onUpdate({ terminalShell: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Auto (Default)</SelectItem>
            <SelectItem value="powershell">PowerShell</SelectItem>
            <SelectItem value="cmd">CMD</SelectItem>
            <SelectItem value="bash">Bash (WSL)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="p-4 rounded-xl bg-surface-secondary border border-standard">
        <div className="text-sm mb-3 text-primary">时间线</div>
        <div className="space-y-3">
          {timelineSettings.map((item) => (
            <label key={item.key} className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm text-primary">{item.label}</div>
                <div className="text-xs text-secondary">{item.desc}</div>
              </div>
              <Switch checked={settings[item.key]}
                onCheckedChange={(v) => onUpdate({ [item.key]: v })} />
            </label>
          ))}
        </div>
      </div>

      {toggleSettings.map((item) => (
        <div key={item.key} className="p-4 rounded-xl bg-surface-secondary border border-standard">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-sm text-primary">{item.label}</div>
              <div className="text-xs mt-0.5 text-secondary">{item.desc}</div>
            </div>
            <Switch checked={settings[item.key]}
              onCheckedChange={(v) => onUpdate({ [item.key]: v })} />
          </label>
        </div>
      ))}
    </div>
  );
}
