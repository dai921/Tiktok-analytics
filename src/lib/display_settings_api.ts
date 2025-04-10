import { API_BASE_URL } from './constants';

// 型定義
export interface ColumnSetting {
  column_name: string;
  is_visible: boolean;
  display_order: number;
}

export interface DisplaySetting {
  is_default: boolean;
  columns: ColumnSetting[];
}

export interface DisplaySettingResponse {
  success: boolean;
  setting_id?: number;
  settings?: DisplaySetting;
  error?: string;
}

// API関数
export const displaySettingsApi = {
  // 表示設定を保存/更新
  async saveSettings(settings: DisplaySetting): Promise<DisplaySettingResponse> {
    try {
      // セッショントークンを取得
      const token = localStorage.getItem('auth_token');
      const tokenType = localStorage.getItem('auth_token_type') || 'Bearer';

      if (!token) {
        throw new Error('認証情報がありません。再度ログインしてください。');
      }

      const response = await fetch(`${API_BASE_URL}/api/display-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${tokenType} ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '表示設定の保存に失敗しました');
      }

      return await response.json();
    } catch (error) {
      console.error('設定保存エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  },

  // 表示設定を取得
  async getSettings(): Promise<DisplaySettingResponse> {
    try {
      // セッショントークンを取得
      const token = localStorage.getItem('auth_token');
      const tokenType = localStorage.getItem('auth_token_type') || 'Bearer';

      if (!token) {
        throw new Error('認証情報がありません。再度ログインしてください。');
      }

      const response = await fetch(`${API_BASE_URL}/api/display-settings`, {
        headers: {
          'Authorization': `${tokenType} ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '表示設定の取得に失敗しました');
      }

      return await response.json();
    } catch (error) {
      console.error('設定取得エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  },

  // デフォルト設定を更新
  async updateDefaultSetting(settingId: number, isDefault: boolean): Promise<DisplaySettingResponse> {
    try {
      // セッショントークンを取得
      const token = localStorage.getItem('auth_token');
      const tokenType = localStorage.getItem('auth_token_type') || 'Bearer';

      if (!token) {
        throw new Error('認証情報がありません。再度ログインしてください。');
      }

      const response = await fetch(`${API_BASE_URL}/api/display-settings/${settingId}/default`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${tokenType} ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ is_default: isDefault }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'デフォルト設定の更新に失敗しました');
      }

      return await response.json();
    } catch (error) {
      console.error('デフォルト設定の更新エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }
};
