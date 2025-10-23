'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { FilterQuery } from '@/types/dashboard'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/hooks/use-toast'
import {
  listPresets,
  createPreset,
  setDefaultPreset,
  deletePreset,
  contextKeyFromTab,
  getDefaultPreset
} from '@/lib/filter_presets_api'
import type { TabType } from '@/lib/filter_presets_api'

type Preset = {
    preset_id: string
    name: string
    is_default: boolean
    context_key: string
    payload: { currentFilters: Record<string, FilterQuery>; visibleColumns?: string[]; tab?: { isPrOnly?: boolean; isCorporateOnly?: boolean; isInfluencerOnly?: boolean } } // ← 拡張
  }

export type PresetMenuProps = {
  tabType: TabType
  getFilters: () => Record<string, FilterQuery>
  applyFilters: (filters: Record<string, FilterQuery>, targetTabKey?: string) => void
  clearFilters: () => void
  getFiltersByTab?: () => Record<TabType, Record<string, FilterQuery>> // ← 追加
  getVisibleColumns?: () => string[];        // ← 追加
  applyVisibleColumns?: (cols: string[]) => void; // ← 追加
  getVisibleColumnsByTab?: () => Record<TabType, string[]>; // ← 追加
  setTabFlags?: (flags: { isPrOnly?: boolean; isCorporateOnly?: boolean; isInfluencerOnly?: boolean }) => void; // ← 追加
}

const tabFlags = (tabType: TabType) => ({
  isPrOnly: tabType === 'affiliate',
  isCorporateOnly: tabType === 'corporate',
  isInfluencerOnly: tabType === 'influencer'
})

export const PresetMenu: React.FC<PresetMenuProps> = ({
  tabType,
  getFilters,
  applyFilters,
  clearFilters,
  getFiltersByTab,
  getVisibleColumns,
  applyVisibleColumns,
  getVisibleColumnsByTab,
  setTabFlags
}) => {
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(false)
  const [openSave, setOpenSave] = useState(false)
  const [name, setName] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)
  const ctx = useMemo(() => contextKeyFromTab(tabType), [tabType])
  const [saveAll, setSaveAll] = useState(false) // ← 追加

  const load = useCallback(async () => {
    try {
      setLoading(true)
      // 現在タブに限定せず全てのプリセットを取得
      const res = await listPresets()
      setPresets((res?.presets || []) as any)
    } catch (e) {
      console.warn(e)
    } finally {
      setLoading(false)
    }
  }, [ctx])

  useEffect(() => {
    load()
  }, [load])

  const handleApply = useCallback((p: Preset) => {
    const incoming = p?.payload?.currentFilters || {}
    // ターゲットタブを payload.tab または context_key から推定
    const inferredFlags = p?.payload?.tab || (() => {
      const suffix = (p?.context_key || '').split(':').pop() as TabType;
      return {
        isPrOnly: suffix === 'affiliate',
        isCorporateOnly: suffix === 'corporate',
        isInfluencerOnly: suffix === 'influencer'
      };
    })();
    const targetTab: TabType =
      inferredFlags?.isCorporateOnly ? 'corporate' :
      inferredFlags?.isInfluencerOnly ? 'influencer' :
      inferredFlags?.isPrOnly ? 'affiliate' : 'all';

    // 先にタブフラグを切替え、その後適用（レース回避のため次tickで適用）
    setTabFlags?.(inferredFlags);
    const cols = p?.payload?.visibleColumns
    setTimeout(() => {
      applyFilters(incoming, targetTab)
      if (Array.isArray(cols) && cols.length) {
        console.log('[DEBUG] プリセット適用のvisibleColumns:', cols);
        applyVisibleColumns?.(cols)
      }
      toast({ title: '保存した表示設定を適用しました', description: p.name })
    }, 0);
  }, [applyFilters, applyVisibleColumns, setTabFlags])

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast({ title: '表示設定名を入力してください' })
      return
    }
    try {
      if (saveAll && getFiltersByTab) { // ← 追加: 全タブ一括保存
        const all = getFiltersByTab()
        const colsByTab = (getVisibleColumnsByTab?.() ?? {}) as Record<TabType, string[]>
        const tabs: TabType[] = ['all', 'affiliate', 'corporate', 'influencer']
        await Promise.all(tabs.map(tab => {
          const ctxEach = contextKeyFromTab(tab)
          const filtersEach = all[tab] || {}
          const colsEach = colsByTab[tab] || []
          return createPreset({
            name: name.trim(),
            context_key: ctxEach,
            payload: {
              currentFilters: filtersEach,
              visibleColumns: colsEach,
              tab: {
                isPrOnly: tab === 'affiliate',
                isCorporateOnly: tab === 'corporate',
                isInfluencerOnly: tab === 'influencer'
              }
            },
            is_default: makeDefault
          })
        }))
        setOpenSave(false)
        setName('')
        setMakeDefault(false)
        setSaveAll(false)
        await load()
        toast({ title: '全タブの表示設定を保存しました' })
        return
      }

      // 従来の単体保存
      const filters = getFilters()
      const cols = getVisibleColumns?.() ?? []
      console.log('[DEBUG] save visibleColumns =', cols);
      await createPreset({
        name: name.trim(),
        context_key: ctx,
        payload: {
          currentFilters: filters,
          visibleColumns: getVisibleColumns?.() ?? [], // ← 追加
          tab: tabFlags(tabType),
        },
        is_default: makeDefault
      })
      setOpenSave(false)
      setName('')
      setMakeDefault(false)
      await load()
      toast({ title: '表示設定を保存しました' })
    } catch (e: any) {
      toast({ title: '保存に失敗しました', description: e?.message || String(e) })
    }
  }, [name, makeDefault, ctx, getFilters, getFiltersByTab, tabType, saveAll, load, getVisibleColumns, applyVisibleColumns, getVisibleColumnsByTab])

  const handleSetDefault = useCallback(async (p: Preset, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await setDefaultPreset(p.preset_id)
      await load()
      toast({ title: 'この表示設定をデフォルトに設定しました', description: p.name })
    } catch (e: any) {  
      toast({ title: '更新に失敗しました', description: e?.message || String(e) })
    }
  }, [load])

  const handleDelete = useCallback(async (p: Preset, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deletePreset(p.preset_id)
      await load()
      toast({ title: '削除しました', description: p.name })
    } catch (e: any) {
      toast({ title: '削除に失敗しました', description: e?.message || String(e) })
    }
  }, [load])

  return (
    <>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={loading}>
              表示設定
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[280px]">
            <DropdownMenuLabel>表示設定</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {presets.length === 0 && (
              <DropdownMenuItem disabled>なし</DropdownMenuItem>
            )}
            {presets.map((p) => {
              const tab =
                (p?.payload?.tab?.isCorporateOnly && 'corporate') ||
                (p?.payload?.tab?.isInfluencerOnly && 'influencer') ||
                (p?.payload?.tab?.isPrOnly && 'affiliate') ||
                ((p?.context_key || '').split(':').pop() as TabType || 'all');
              const tabLabel = tab === 'corporate' ? '企業' : tab === 'affiliate' ? 'アフィ' : tab === 'influencer' ? 'インフル' : 'すべて';
              return (
              <DropdownMenuItem key={p.preset_id} onClick={() => handleApply(p)}>
                <div className="flex w-full items-center justify-between">
                  <div className="truncate">
                    <span className="mr-2 text-xs text-gray-500">[{tabLabel}]</span>{p.name}
                    {p.is_default ? <span className="ml-2 text-xs text-sky-600">(デフォルト)</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={(e) => handleSetDefault(p, e)}>デフォルトにする</Button>
                    <Button size="sm" variant="ghost" onClick={(e) => handleDelete(p, e)}>削除</Button>
                  </div>
                </div>
              </DropdownMenuItem>
            )})}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={clearFilters}>クリア</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" onClick={() => { setSaveAll(false); setOpenSave(true) }}>表示設定を保存</Button>
      </div>

      <Dialog
        open={openSave}
        onOpenChange={(open) => {
          setOpenSave(open);
          if (!open) {
            setSaveAll(false);
            setName('');
            setMakeDefault(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{saveAll ? '全タブの表示設定を保存' : '表示設定を保存'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Input
                placeholder="表示設定名"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="makeDefault" checked={makeDefault} onCheckedChange={(v) => setMakeDefault(Boolean(v))} />
              <label htmlFor="makeDefault" className="text-sm">デフォルトとして保存</label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpenSave(false)} variant="ghost">キャンセル</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
