// src/components/dashboard/data-table/filter-hooks.tsx
import { useState, useEffect, useCallback } from 'react';
import { FilterValue, FilterQuery } from '@/types/dashboard';
import { getFilterOptions } from '@/lib/api';

export const useFilterOptions = (currentFilters: Record<string, FilterQuery>) => {
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [accountList, setAccountList] = useState<string[]>([]);
  const [hashtagList, setHashtagList] = useState<string[]>([]);
  const [audioTitleList, setAudioTitleList] = useState<string[]>([]);
  const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false);

  // フィルター条件に基づいて選択肢を取得する関数
  const loadFilterOptions = useCallback(async () => {
    try {
      setIsLoadingFilterOptions(true);
      console.log('フィルター条件に基づく選択肢データの取得開始:', {
        currentFilters,
        フィルター数: Object.keys(currentFilters).length,
        詳細: JSON.stringify(currentFilters)
      });
      
      // 最適化されたAPIを使って選択肢のみを取得
      const result = await getFilterOptions(currentFilters);
      
      if (result.success) {
        console.log(`選択肢データの取得成功:`, {
          カテゴリ数: result.categories.length,
          アカウント数: result.accounts.length,
          ハッシュタグ数: result.hashtags.length,
          音声タイトル数: result.music.length,
          カテゴリサンプル: result.categories.slice(0, 3)
        });
        
        // 取得した選択肢をセット
        setCategoryList(result.categories);
        setAccountList(result.accounts);
        setHashtagList(result.hashtags);
        setAudioTitleList(result.music);
      } else {
        console.error('選択肢データの取得に失敗:', result.error || '不明なエラー');
      }
    } catch (error) {
      console.error('フィルター選択肢取得中のエラー:', error);
    } finally {
      setIsLoadingFilterOptions(false);
    }
  }, [currentFilters]);

  // フィルター変更時に、フィルターされたデータに基づいて選択肢を更新
  useEffect(() => {
    loadFilterOptions();
  }, [currentFilters, loadFilterOptions]);

  // 特定のカラムの選択肢を取得する関数
  const getFilteredOptions = useCallback((columnName: string) => {
    const activeFilterCount = Object.keys(currentFilters).length;
    const useInitialCache = activeFilterCount === 0;
    const isTransitioning = isLoadingFilterOptions && activeFilterCount > 0;
    
    if (isTransitioning) {
      console.log(`${columnName} - ローディング中のため空の配列を返します`);
      return [];
    }
    
    switch (columnName) {
      case 'PR動画ジャンル':
        return useInitialCache && categoryList.length > 0 
          ? categoryList 
          : categoryList;
        
      case 'アカウント名':
        return useInitialCache && accountList.length > 0
          ? accountList
          : accountList;
        
      case 'ハッシュタグ':
        return useInitialCache && hashtagList.length > 0
          ? hashtagList
          : hashtagList;
        
      case 'BGM':
        return useInitialCache && audioTitleList.length > 0
          ? audioTitleList
          : audioTitleList;
        
      default:
        return [];
    }
  }, [categoryList, accountList, hashtagList, audioTitleList, isLoadingFilterOptions, currentFilters]);

  return {
    categoryList,
    accountList,
    hashtagList,
    audioTitleList,
    isLoadingFilterOptions,
    getFilteredOptions,
    loadFilterOptions
  };
};