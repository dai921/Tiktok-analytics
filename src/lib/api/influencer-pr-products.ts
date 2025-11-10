import type {
  InfluencerPrProduct,
  InfluencerPrProductUpdate,
} from '@/types/influencerPrProduct';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
};

const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
};

const buildAuthHeaders = () => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('認証情報が見つかりません。');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

const handleApiError = (error: unknown): ApiResponse<never> => {
  console.error('influencer_pr_products API error:', error);
  return {
    success: false,
    error: error instanceof Error ? error.message : '不明なエラーが発生しました',
  };
};

export async function fetchPendingPrProducts(): Promise<
  ApiResponse<InfluencerPrProduct[]>
> {
  try {
    const headers = buildAuthHeaders();
    const response = await fetch(
      `${apiUrl}/api/influencer-pr-products/pending`,
      {
        method: 'GET',
        headers,
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData?.detail || '未判定PR商材の取得に失敗しました。',
      );
    }

    const data = await response.json();
    return {
      success: true,
      data: (data?.data ?? []) as InfluencerPrProduct[],
      count: data?.count ?? (Array.isArray(data?.data) ? data.data.length : 0),
    };
  } catch (error) {
    return handleApiError(error);
  }
}

export async function fetchPendingPrProductsCount(): Promise<
  ApiResponse<number>
> {
  try {
    const headers = buildAuthHeaders();
    const response = await fetch(
      `${apiUrl}/api/influencer-pr-products/pending/count`,
      {
        method: 'GET',
        headers,
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData?.detail || '未判定PR商材数の取得に失敗しました。',
      );
    }

    const data = await response.json();
    return {
      success: true,
      data: Number(data?.count ?? 0),
    };
  } catch (error) {
    return handleApiError(error);
  }
}

export async function approvePrProduct(
  productId: number,
  updates: InfluencerPrProductUpdate = {},
): Promise<ApiResponse<InfluencerPrProduct>> {
  try {
    const headers = buildAuthHeaders();
    const response = await fetch(
      `${apiUrl}/api/influencer-pr-products/${productId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          ...updates,
          is_pr: true,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData?.detail || 'PR商材の承認に失敗しました。',
      );
    }

    const data = await response.json();
    return {
      success: true,
      data: data?.data as InfluencerPrProduct,
    };
  } catch (error) {
    return handleApiError(error);
  }
}

export async function updatePrProduct(
  productId: number,
  updates: InfluencerPrProductUpdate,
): Promise<ApiResponse<InfluencerPrProduct>> {
  try {
    const headers = buildAuthHeaders();
    const response = await fetch(
      `${apiUrl}/api/influencer-pr-products/${productId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData?.detail || 'PR商材の更新に失敗しました。',
      );
    }

    const data = await response.json();
    return {
      success: true,
      data: data?.data as InfluencerPrProduct,
    };
  } catch (error) {
    return handleApiError(error);
  }
}

export async function deletePrProduct(
  productId: number,
): Promise<ApiResponse<null>> {
  try {
    const headers = buildAuthHeaders();
    const response = await fetch(
      `${apiUrl}/api/influencer-pr-products/${productId}`,
      {
        method: 'DELETE',
        headers,
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData?.detail || 'PR商材の削除に失敗しました。',
      );
    }

    return {
      success: true,
      data: null,
    };
  } catch (error) {
    return handleApiError(error);
  }
}
