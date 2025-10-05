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
  console.log('=== fetchTranscription開始 ===')
  console.log('入力URL:', url)
  
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    console.log('API URL:', apiUrl)
    
    if (!apiUrl) {
      console.error('API URLが未設定')
      throw new Error('API URLが設定されていません');
    }

    // 認証トークンを付与（存在すれば）
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const tokenType = typeof window !== 'undefined' ? localStorage.getItem('auth_token_type') : null;

    const requestUrl = `${apiUrl}/api/transcription`;
    const requestBody = { url: url.trim() };
    
    console.log('リクエストURL:', requestUrl)
    console.log('リクエストボディ:', requestBody)
    console.log('fetch開始...')

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `${tokenType ?? 'Bearer'} ${token}` } : {})
      },
      body: JSON.stringify(requestBody),
    });

    console.log('fetchレスポンス受信')
    console.log('ステータス:', response.status)
    console.log('ステータステキスト:', response.statusText)
    console.log('OK:', response.ok)

    if (!response.ok) {
      console.error('HTTPエラーレスポンス:', response.status, response.statusText)
      
      // エラーレスポンスの内容を取得
      let errorDetail = '';
      try {
        console.log('エラーレスポンスのJSON解析試行...')
        const errorData = await response.json();
        console.log('エラーデータ:', errorData)
        errorDetail = errorData.error || errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        console.log('JSON解析失敗、テキスト取得試行...')
        try {
          errorDetail = await response.text() || `HTTPエラー: ${response.status}`;
          console.log('エラーテキスト:', errorDetail)
        } catch (textError) {
          console.error('テキスト取得も失敗:', textError)
          errorDetail = `HTTPエラー: ${response.status}`;
        }
      }
      throw new Error(errorDetail);
    }

    console.log('成功レスポンスのJSON解析開始...')
    const data: TranscriptionResponse = await response.json();
    console.log('解析完了、データ:', data)
    
    return data;
    
  } catch (error) {
    console.error('=== fetchTranscription例外 ===')
    console.error('エラーオブジェクト:', error);
    console.error('エラー型:', typeof error)
    console.error('エラー名:', error instanceof Error ? error.name : 'unknown')
    console.error('エラーメッセージ:', error instanceof Error ? error.message : String(error))
    console.error('エラースタック:', error instanceof Error ? error.stack : 'no stack')
    
    // エラーメッセージを統一形式で返す
    const errorMessage = error instanceof Error ? error.message : '文字起こし処理に失敗しました';
    
    return {
      success: false,
      error: errorMessage
    };
  }
}; 