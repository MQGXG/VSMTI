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
          <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>模型</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>管理所有可用模型，启用后可在对话框中选择使用</p>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>已启用 {enabledCount} / {totalCount}</div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索模型..."
          className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all duration-200"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([providerName, models]) => (
          <div key={providerName} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Cpu className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{providerName}</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>({models.length})</span>
            </div>
            <div className="space-y-1">
              {models.map((model) => (
                <div key={`${model.providerId}-${model.id}`}
                  className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: model.enabled ? '#00D9C0' : 'var(--border)' }} />
                    <div>
                      <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{model.name}</div>
                      <div className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{model.id}</div>
                    </div>
                  </div>
                  <div onClick={() => toggleModel(model.providerId, model.id)}
                    className="w-11 h-6 rounded-full relative cursor-pointer transition-colors"
                    style={{ background: model.enabled ? '#00D9C0' : 'var(--border)' }}>
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" style={{ transform: model.enabled ? 'translateX(20px)' : 'translateX(2px)' }} />
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
