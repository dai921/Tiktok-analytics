export interface TranscriptionRequest {
  url: string;
}

export interface TranscriptionResponse {
  success: boolean;
  video_id?: string;
  transcription?: string;
  source?: 'database' | 'generated';
  error?: string;
}

/**
 * TikTok動画の文字起こしを取得または生成する
 */
export const fetchTranscription = async (url: string): Promise<TranscriptionResponse> => {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    
    if (!apiUrl) {
      throw new Error('API URLが設定されていません');
    }

    const response = await fetch(`${apiUrl}/api/transcription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: url.trim() }),
    });

    if (!response.ok) {
      // エラーレスポンスの内容を取得
      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = errorData.error || errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        errorDetail = await response.text() || `HTTPエラー: ${response.status}`;
      }
      throw new Error(errorDetail);
    }

    const data: TranscriptionResponse = await response.json();
    return data;
    
  } catch (error) {
    console.error('文字起こしAPI呼び出しエラー:', error);
    
    // エラーメッセージを統一形式で返す
    const errorMessage = error instanceof Error ? error.message : '文字起こし処理に失敗しました';
    
    return {
      success: false,
      error: errorMessage
    };
  }
}; 