function testExtractThumbnailId() {
  console.log('=== Testing Thumbnail ID Extraction with Actual Data ===');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
  const range = sheet.getRange('A1:Z31');  // ヘッダー行 + 30件のデータ
  const values = range.getValues();
  const formulas = range.getFormulas();
  
  // ヘッダー行からサムネイル列のインデックスを取得
  const headers = values[0];
  const thumbnailIndex = headers.findIndex(header => header === 'カバー画像');
  
  if (thumbnailIndex === -1) {
    console.error('❌ Thumbnail column not found');
    return;
  }

  console.log(`Found thumbnail column at index ${thumbnailIndex}`);
  
  // 各行のテスト（ヘッダー行をスキップ）
  values.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;  // 実際の行番号（ヘッダー行 + 1 + インデックス）
    const formula = formulas[index + 1][thumbnailIndex];  // formulasの対応する位置
    const thumbnailId = extractThumbnailId(formula);
    
    console.log(`\nRow ${rowNumber}:`);
    console.log({
      formula: formula || '(empty)',
      extracted: thumbnailId || '(no ID found)',
      status: thumbnailId ? '✅ Valid ID' : '❌ No ID',
      url: thumbnailId ? `https://lh3.googleusercontent.com/d/${thumbnailId}` : 'N/A'
    });
  });
}

function testHandleRequest() {
  console.log('=== Testing API Response with First 30 Rows ===');
  
  const mockRequest = {
    postData: {
      contents: JSON.stringify({
        page: 1,
        limit: 30
      })
    }
  };

  const response = doPost(mockRequest);
  const responseData = JSON.parse(response.getContent());
  
  console.log('Response Overview:', {
    success: responseData.success ? '✅' : '❌',
    totalRows: responseData.total,
    returnedRows: responseData.data.length,
    hasData: responseData.data.length > 0 ? '✅' : '❌'
  });

  if (responseData.data.length > 0) {
    console.log('\nThumbnail Check for First 30 Rows:');
    responseData.data.forEach((row, index) => {
      console.log(`\nRow ${index + 1}:`, {
        id: row.id,
        hasValidThumbnail: row.thumbnail ? '✅' : '❌',
        thumbnailUrl: row.thumbnail?.url || 'No URL'
      });
    });
  }
} 