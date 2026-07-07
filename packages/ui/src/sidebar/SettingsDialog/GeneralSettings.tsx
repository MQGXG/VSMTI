import { useState } from "react"
import { ThemeSelector } from "../ThemeSelector";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

interface Props {
  settings: Record<string, any>;
  onUpdate: (patch: Record<string, any>) => void;
}

function useModelList() {
  const [models, setModels] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("pet_models") || '{"hiyori":"/models/hiyori/Hiyori.model3.json"}') }
    catch { return { hiyori: "/models/hiyori/Hiyori.model3.json" } }
  })
  const save = (m: Record<string, string>) => {
    localStorage.setItem("pet_models", JSON.stringify(m))
    setModels(m)
  }
  const add = (key: string, path: string) => {
    if (!key || !path || models[key]) return
    save({ ...models, [key]: path })
  }
  const remove = (key: string) => {
    if (key === "hiyori") return
    const { [key]: _, ...rest } = models
    save(rest)
  }
  return { models, add, remove }
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
  const { models, add, remove } = useModelList()
  const [newKey, setNewKey] = useState("")
  const [newPath, setNewPath] = useState("")

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

      <div className="p-4 rounded-xl bg-surface-secondary border border-standard">
        <div className="text-sm mb-3 text-primary">Live2D 桌宠</div>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-sm text-primary">启用桌宠</div>
              <div className="text-xs mt-0.5 text-secondary">在桌面显示 Live2D 角色，支持直接对话</div>
            </div>
            <Switch checked={settings.live2dPet}
              onCheckedChange={(v) => {
                onUpdate({ live2dPet: v })
                window.electronAPI?.live2d?.toggle(v)
              }} />
          </label>
          {settings.live2dPet && (
            <>
              <div>
                <label className="text-xs mb-1 block text-secondary">角色模型</label>
                <Select value={settings.petModel || "hiyori"}
                  onValueChange={(v) => {
                    onUpdate({ petModel: v })
                    localStorage.setItem("pet_model", v)
                  }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(models).map(([key, path]) => (
                      <SelectItem key={key} value={key}>
                        {key}{key === "hiyori" ? "（默认）" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs mb-1 block text-secondary">添加模型</label>
                  <input placeholder="名称（如 my-model）" value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-standard bg-surface"
                  />
                </div>
                <div className="flex-1">
                  <input placeholder="路径（如 /models/xxx/model3.json）" value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-standard bg-surface"
                  />
                </div>
                <button onClick={() => { add(newKey, newPath); setNewKey(""); setNewPath("") }}
                  className="px-3 py-1.5 text-xs rounded-md bg-primary text-white shrink-0">
                  添加
                </button>
              </div>
              {Object.keys(models).length > 1 && (
                <div className="text-xs text-tertiary space-y-1">
                  {Object.keys(models).filter(k => k !== "hiyori").map(k => (
                    <div key={k} className="flex items-center justify-between">
                      <span>{k}</span>
                      <button onClick={() => remove(k)} className="text-red-400 hover:text-red-300">删除</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-sm text-primary">关闭主窗口时关闭桌宠</div>
                  <div className="text-xs mt-0.5 text-secondary">关闭主应用窗口时同时关闭桌宠窗口</div>
                </div>
                <Switch checked={settings.closePetWithApp}
                  onCheckedChange={(v) => onUpdate({ closePetWithApp: v })} />
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
