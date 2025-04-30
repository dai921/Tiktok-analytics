import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/constants';

// 製品カテゴリの型定義
export interface Product {
  name: string;
  category: string;
}

interface ProductsResponse {
  success: boolean;
  data: Product[];
  categories: Record<string, string[]>;
}

// 製品名からカテゴリを取得するためのマッピングを提供するカスタムフック
export const useProductCategories = () => {
  const [productCategories, setProductCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProductCategories = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/products`);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data: ProductsResponse = await response.json();
        
        if (data.success) {
          // 製品名からカテゴリへのマッピングを作成
          const mapping: Record<string, string> = {};
          data.data.forEach(product => {
            mapping[product.name] = product.category;
          });
          
          setProductCategories(mapping);
        } else {
          throw new Error('Failed to fetch product categories');
        }
      } catch (err) {
        console.error('Error fetching product categories:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchProductCategories();
  }, []);

  return { productCategories, loading, error };
}; 