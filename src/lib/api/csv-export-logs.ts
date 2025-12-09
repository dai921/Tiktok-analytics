const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

export type ExportSource = 
  | 'dashboard'
  | 'trends_product'
  | 'trends_genre'
  | 'overall_sounds'
  | 'overall_hashtags';

export type TabType = 'all' | 'affiliate' | 'corporate' | 'influencer';

export interface CsvExportLogParams {
  export_source: ExportSource;
  tab_type?: TabType;
  export_params?: Record<string, unknown>;
  export_status: 'success' | 'failed';
  row_count?: number;
  file_size_bytes?: number;
  error_message?: string;
}

export async function recordCsvExportLog(params: CsvExportLogParams): Promise<void> {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.warn('[CSV Export Log] 認証トークンがないためログ記録をスキップ');
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/csv-export-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.warn('[CSV Export Log] ログ記録に失敗:', response.status);
    }
  } catch (error) {
    // ログ記録の失敗はユーザー体験に影響しないようにサイレント処理
    console.warn('[CSV Export Log] ログ記録中にエラー:', error);
  }
}