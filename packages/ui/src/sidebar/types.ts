export interface ProviderModel {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Provider {
  id: string;
  name: string;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  website?: string;
  apiFormat: "openai" | "anthropic" | "custom";
  headers: Record<string, string>;
  options: Record<string, string | number | boolean>;
  models: ProviderModel[];
}

export interface ProviderFormData {
  id: string;
  name: string;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  website: string;
  apiFormat: "openai" | "anthropic" | "custom";
  headers: Array<{ key: string; value: string }>;
  options: Array<{ key: string; value: string }>;
  models: Array<{ id: string; name: string }>;
}
