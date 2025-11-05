import { useState, useEffect, useCallback, useRef } from 'react';
import { FilterQuery } from '@/types/dashboard';
import { getFilterOptions } from '@/lib/api';

type FilterOptionsPayload = {
  categories: string[];
  accounts: string[];
  hashtags: string[];
  music: string[];
  products: string[];
  productCategories: Record<string, string[]>;
  productCategoryMap: Record<string, string>;
  accountTypes: string[];
  secondAccountTypes: string[];
  thirdAccountTypes: string[];
  thirdAccountTypeMap: Record<string, string>;
};

const REQUEST_DEBOUNCE_MS = 1000;
const FILTER_REFRESH_DELAY_MS = 300;

export const useFilterOptions = (
  _currentFilters: Record<string, FilterQuery>,
  onFilterOptionsUpdate?: (options: FilterOptionsPayload & { isLoading: boolean }) => void
) => {
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [accountList, setAccountList] = useState<string[]>([]);
  const [hashtagList, setHashtagList] = useState<string[]>([]);
  const [productList, setProductList] = useState<string[]>([]);
  const [audioTitleList, setAudioTitleList] = useState<string[]>([]);
  const [productCategoriesGrouped, setProductCategoriesGrouped] = useState<Record<string, string[]>>({});
  const [productCategoryLookup, setProductCategoryLookup] = useState<Record<string, string>>({});
  const [secondAccountTypeList, setSecondAccountTypeList] = useState<string[]>([]);
  const [thirdAccountTypeList, setThirdAccountTypeList] = useState<string[]>([]);
  const [thirdAccountTypeMap, setThirdAccountTypeMap] = useState<Record<string, string>>({});
  const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false);

  const hasInitialLoad = useRef(false);
  const lastRequestTime = useRef(0);

  const emitUpdate = useCallback(
    (options: FilterOptionsPayload, isLoading: boolean) => {
      if (!onFilterOptionsUpdate) return;
      onFilterOptionsUpdate({
        ...options,
        isLoading,
      });
    },
    [onFilterOptionsUpdate]
  );

  const syncFromResult = useCallback(
    (result: Partial<FilterOptionsPayload>) => {
      const productCategories = result.productCategories || {};
      const productMap: Record<string, string> = {};
      Object.entries(productCategories).forEach(([category, items]) => {
        items.forEach(productName => {
          if (productName) {
            productMap[productName] = category;
          }
        });
      });

      const payload: FilterOptionsPayload = {
        categories: result.categories || [],
        accounts: result.accounts || [],
        hashtags: result.hashtags || [],
        music: result.music || [],
        products: result.products || [],
        productCategories,
        productCategoryMap: productMap,
        accountTypes: result.accountTypes || [],
        secondAccountTypes: result.secondAccountTypes || [],
        thirdAccountTypes: result.thirdAccountTypes || [],
        thirdAccountTypeMap: result.thirdAccountTypeMap || {},
      };

      setCategoryList(payload.categories);
      setAccountList(payload.accounts);
      setHashtagList(payload.hashtags);
      setAudioTitleList(payload.music);
      setProductList(payload.products);
      setProductCategoriesGrouped(payload.productCategories);
      setProductCategoryLookup(payload.productCategoryMap);
      setSecondAccountTypeList(payload.secondAccountTypes);
      setThirdAccountTypeList(payload.thirdAccountTypes);
      setThirdAccountTypeMap(payload.thirdAccountTypeMap);

      emitUpdate(payload, false);
    },
    [emitUpdate]
  );

  const loadOptions = useCallback(
    async (filters: Record<string, FilterQuery> = {}) => {
      try {
        setIsLoadingFilterOptions(true);
        const result = await getFilterOptions(filters);
        if (result.success) {
          syncFromResult(result);
        }
      } catch (error) {
        console.error('[filter-hooks] failed to load filter options:', error);
      } finally {
        setIsLoadingFilterOptions(false);
      }
    },
    [syncFromResult]
  );

  useEffect(() => {
    if (hasInitialLoad.current) return;
    hasInitialLoad.current = true;
    loadOptions({});
  }, [loadOptions]);

  const refreshFilterOptions = useCallback(
    (filters: Record<string, FilterQuery>) => {
      if (Object.keys(filters).length === 0) return;

      const now = Date.now();
      if (now - lastRequestTime.current < REQUEST_DEBOUNCE_MS) {
        console.log('[filter-hooks] debounce: skip filter-options request');
        return;
      }

      lastRequestTime.current = now;
      setTimeout(() => {
        loadOptions(filters);
      }, FILTER_REFRESH_DELAY_MS);
    },
    [loadOptions]
  );

  const getFilteredOptions = useCallback(
    (columnName: string) => {
      switch (columnName) {
        case 'PR投稿ジャンル':
          return categoryList;
        case 'アカウント名':
          return accountList;
        case 'ハッシュタグ':
          return hashtagList;
        case 'BGM':
          return audioTitleList;
        case '目的':
          return secondAccountTypeList;
        case '中ジャンル':
          return thirdAccountTypeList;
        default:
          return [];
      }
    },
    [categoryList, accountList, hashtagList, audioTitleList, secondAccountTypeList, thirdAccountTypeList]
  );

  return {
    categoryList,
    accountList,
    hashtagList,
    productList,
    audioTitleList,
    productCategories: productCategoriesGrouped,
    productCategoryMap: productCategoryLookup,
    secondAccountTypeList,
    thirdAccountTypeList,
    thirdAccountTypeMap,
    isLoadingFilterOptions,
    getFilteredOptions,
    loadFilterOptions: refreshFilterOptions,
  };
};
