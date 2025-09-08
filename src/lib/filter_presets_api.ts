import type { FilterQuery } from '@/types/dashboard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const authHeaders = (): HeadersInit => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const tokenTypeRaw = typeof window !== 'undefined' ? localStorage.getItem('auth_token_type') : 'Bearer';
  const tokenType = (tokenTypeRaw || 'Bearer').charAt(0).toUpperCase() + (tokenTypeRaw || 'Bearer').slice(1).toLowerCase();
  return token ? { Authorization: `${tokenType} ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

export type TabType = 'all' | 'affiliate' | 'corporate' | 'influencer';

export const contextKeyFromTab = (tab: TabType): string => `dashboard:v1:${tab}`;

export interface FilterPresetPayload {
  currentFilters: Record<string, FilterQuery>;
  visibleColumns?: string[];                 // ← 追加
  tab?: { isPrOnly?: boolean; isCorporateOnly?: boolean; isInfluencerOnly?: boolean };
  sortMeta?: {
    primary?: { field: string; direction: 'asc' | 'desc' } | null;
    secondary?: { field: string; direction: 'asc' | 'desc' } | null;
  };
}

export interface FilterPreset {
  id: number;
  preset_id: string;
  user_number: number;
  name: string;
  context_key: string;
  payload: FilterPresetPayload;
  schema_version: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export async function listPresets(context_key?: string) {
  const params = new URLSearchParams();
  if (context_key) params.append('context_key', context_key);
  const res = await fetch(`${API_BASE_URL}/api/filter-presets?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean; presets: FilterPreset[] }>;
}

export async function getDefaultPreset(context_key: string) {
  const params = new URLSearchParams({ context_key });
  const res = await fetch(`${API_BASE_URL}/api/filter-presets/default?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean; preset: FilterPreset | null }>;
}

export async function getPreset(preset_id: string) {
  const res = await fetch(`${API_BASE_URL}/api/filter-presets/${preset_id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean; preset: FilterPreset }>;
}

export async function createPreset(input: {
  name: string;
  context_key: string;
  payload: FilterPresetPayload;
  schema_version?: number;
  is_default?: boolean;
}) {
  const res = await fetch(`${API_BASE_URL}/api/filter-presets`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ...input, schema_version: input?.schema_version ?? 1, is_default: !!input?.is_default })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean; preset: FilterPreset }>;
}

export async function updatePreset(preset_id: string, input: Partial<{
  name: string;
  context_key: string;
  payload: FilterPresetPayload;
  schema_version: number;
  is_default: boolean;
}>) {
  const res = await fetch(`${API_BASE_URL}/api/filter-presets/${preset_id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean; preset: FilterPreset }>;
}

export async function setDefaultPreset(preset_id: string) {
  const res = await fetch(`${API_BASE_URL}/api/filter-presets/${preset_id}/set-default`, {
    method: 'POST',
    headers: authHeaders()
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean; preset: FilterPreset }>;
}

export async function deletePreset(preset_id: string) {
  const res = await fetch(`${API_BASE_URL}/api/filter-presets/${preset_id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ success: boolean }>;
}
