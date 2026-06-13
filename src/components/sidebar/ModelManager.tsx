import { useState } from "react";
import { Search, Cpu } from "lucide-react";
import type { Provider, ProviderModel } from "./types";

interface Props {
  providers: Provider[];
  onChange: (list: Provider[]) => void;
}

export function ModelManager({ providers, onChange }: Props) {
  const [search, setSearch] = useState("");

  const toggleModel = (providerId: string, modelId: string) => {
    onChange(
      providers.map((p) => {
        if (p.id !== providerId) return p;
        return { ...p, models: p.models.map((m) => m.id === modelId ? { ...m, enabled: !m.enabled } : m) };
      })
    );
  };

  const allModels = providers.flatMap((p) =>
    p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.displayName || p.name }))
  );

  const filtered = search
    ? allModels.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.providerName.toLowerCase().includes(search.toLowerCase()))
    : allModels;

  const grouped = filtered.reduce((acc, model) => {
    if (!acc[model.providerName]) acc[model.providerName] = [];
    acc[model.providerName].push(model);
    return acc;
  }, {} as Record<string, typeof filtered>);

  const enabledCount = allModels.filter((m) => m.enabled).length;
  const totalCount = allModels.length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-200">模型</h3>
          <p className="text-xs text-neutral-500 mt-1">管理所有可用模型，启用后可在对话框中选择使用</p>
        </div>
        <div className="text-xs text-neutral-500">已启用 {enabledCount} / {totalCount}</div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索模型..."
          className="w-full bg-white/5 border border-glass-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-neutral-200 outline-none focus:border-accent-500/40 transition-colors placeholder-neutral-500"
        />
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([providerName, models]) => (
          <div key={providerName} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Cpu className="w-4 h-4 text-neutral-500" />
              <span className="text-sm font-medium text-neutral-300">{providerName}</span>
              <span className="text-xs text-neutral-600">({models.length})</span>
            </div>
            <div className="space-y-1">
              {models.map((model) => (
                <div key={`${model.providerId}-${model.id}`}
                  className="flex items-center justify-between px-4 py-3 rounded-xl glass border border-glass-border hover:border-accent-500/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${model.enabled ? "bg-emerald-500" : "bg-neutral-700"}`} />
                    <div>
                      <div className="text-sm text-gray-900 dark:text-neutral-200">{model.name}</div>
                      <div className="text-xs text-neutral-600 font-mono">{model.id}</div>
                    </div>
                  </div>
                  <div onClick={() => toggleModel(model.providerId, model.id)}
                    className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors ${model.enabled ? "bg-accent-600" : "bg-neutral-700"}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${model.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
