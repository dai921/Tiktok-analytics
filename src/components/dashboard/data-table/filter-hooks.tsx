// src/components/dashboard/data-table/filter-hooks.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FilterValue, FilterQuery } from '@/types/dashboard';
import { getFilterOptions } from '@/lib/api';

export const useFilterOptions = (currentFilters: Record<string, FilterQuery>) => {
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [accountList, setAccountList] = useState<string[]>([]);
  const [hashtagList, setHashtagList] = useState<string[]>([]);
  const [audioTitleList, setAudioTitleList] = useState<string[]>([]);
  const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false);
  
  // ★ 永久ループ防止のための制御変数
  const hasInitialLoad = useRef(false);
  const lastRequestTime = useRef(0);
  const REQUEST_DEBOUNCE = 1000; // 1秒のデバウンス

  // ★ 初回ロード時のみデータを取得
  useEffect(() => {
    const loadInitialOptions = async () => {
      if (hasInitialLoad.current) return;
      
      try {
        hasInitialLoad.current = true;
        setIsLoadingFilterOptions(true);
        
        console.log('🔄 初回カテゴリデータ取得開始');
        
        // 空のフィルターでカテゴリ一覧を取得
        const result = await getFilterOptions({});
        
        if (result.success) {
          console.log('✅ カテゴリデータ取得成功:', {
            カテゴリ数: result.categories.length,
            カテゴリサンプル: result.categories.slice(0, 5)
          });
          
          setCategoryList(result.categories);
          setAccountList(result.accounts);
          setHashtagList(result.hashtags);
          setAudioTitleList(result.music);
        } else {
          console.error('❌ カテゴリデータ取得失敗:', result.error);
        }
      } catch (error) {
        console.error('❌ カテゴリデータ取得エラー:', error);
      } finally {
        setIsLoadingFilterOptions(false);
      }
    };

    loadInitialOptions();
  }, []); // 空の依存配列で初回のみ実行

  // ★ フィルター条件変更時の処理（デバウンス付き）
  const loadFilteredOptions = useCallback(async (filters: Record<string, FilterQuery>) => {
    const now = Date.now();
    
    // デバウンス制御
    if (now - lastRequestTime.current < REQUEST_DEBOUNCE) {
      console.log('🛑 デバウンスによりリクエストをスキップ');
      return;
    }
    
    lastRequestTime.current = now;
    
    try {
      setIsLoadingFilterOptions(true);
      console.log('🔄 フィルター適用後のデータ取得開始');
      
      const result = await getFilterOptions(filters);
      
      if (result.success) {
        setCategoryList(result.categories);
        setAccountList(result.accounts);
        setHashtagList(result.hashtags);
        setAudioTitleList(result.music);
      }
    } catch (error) {
      console.error('❌ フィルターデータ取得エラー:', error);
    } finally {
      setIsLoadingFilterOptions(false);
    }
  }, []);

  // ★ 手動でフィルターオプションを更新する関数
  const refreshFilterOptions = useCallback((filters: Record<string, FilterQuery>) => {
    // フィルターが空の場合は何もしない
    if (Object.keys(filters).length === 0) return;
    
    // デバウンス付きで実行
    setTimeout(() => {
      loadFilteredOptions(filters);
    }, 300);
  }, [loadFilteredOptions]);

  // 特定のカラムの選択肢を取得する関数
  const getFilteredOptions = useCallback((columnName: string) => {
    switch (columnName) {
      case 'PR動画ジャンル':
        return categoryList;
      case 'アカウント名':
        return accountList;
      case 'ハッシュタグ':
        return hashtagList;
      case 'BGM':
        return audioTitleList;
      default:
        return [];
    }
  }, [categoryList, accountList, hashtagList, audioTitleList]);

  return {
    categoryList,
    accountList,
    hashtagList,
    audioTitleList,
    isLoadingFilterOptions,
    getFilteredOptions,
    loadFilterOptions: refreshFilterOptions // 手動更新関数を返す
  };
};