function doGet(e) {
  const page = parseInt(e.parameter.page) || 1;
  const limit = 50;
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
  const totalRows = sheet.getLastRow() - 1;  // ヘッダーを除く
  
  // 必要な範囲のみ取得
  const startRow = ((page - 1) * limit) + 2;  // ヘッダー行 + offset
  const numRows = Math.min(limit, totalRows - ((page - 1) * limit));
  
  // 必要な範囲のデータのみを取得
  const data = sheet.getRange(startRow, 1, numRows, 26).getValues();
  
  const rows = data.map(row => ({
    id: row[2],
    url: row[0],
    accountName: row[1],
    videoId: row[2],
    thumbnail: row[3],
    authorName: row[4],
    description: row[5],
    likes: row[6],
    views: row[7],
    comments: row[8],
    shares: row[9],
    saves: row[10],
    createdAt: row[11],
    hashtags: row[12].split(','),
    duration: row[13],
    isViral: row[14] === 'TRUE',
    prevFetchDate: row[15],
    currentFetchDate: row[16],
    prevViews: row[17],
    viewsIncrease: row[18],
    prevLikes: row[19],
    likesIncrease: row[20],
    product: row[21],
    category: row[22],
    audioId: row[23],
    audioTitle: row[24],
    artist: row[25]
  }));

  return ContentService.createTextOutput(JSON.stringify({
    data: rows,
    total: totalRows,
    currentPage: page,
    totalPages: Math.ceil(totalRows / limit),
    success: true
  }))
  .setMimeType(ContentService.MimeType.JSON);
}

// 定期的にデータを更新（例：1時間ごと）
function updateCache() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
  const data = sheet.getDataRange().getValues();
  const cache = CacheService.getScriptCache();
  
  // 50件ごとにキャッシュに保存
  const chunks = [];
  for (let i = 0; i < data.length; i += 50) {
    const chunk = data.slice(i, i + 50);
    chunks.push(chunk);
  }
  
  chunks.forEach((chunk, index) => {
    cache.put(`data_chunk_${index}`, JSON.stringify(chunk));
  });
}

// トリガーを設定
function setTrigger() {
  ScriptApp.newTrigger('updateCache')
    .timeBased()
    .everyHours(1)
    .create();
}

// シート内にインデックスを作成
function createIndex() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
  const indexSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('インデックス') || 
    SpreadsheetApp.getActiveSpreadsheet().insertSheet('インデックス');
  
  // よく使用される検索キーでインデックスを作成
  const data = sheet.getDataRange().getValues();
  const index = data.map((row, i) => ({
    id: row[2],
    row: i + 1,
    category: row[22],
    product: row[21]
  }));
  
  indexSheet.clear();
  indexSheet.getRange(1, 1, index.length, 4).setValues(
    index.map(item => [item.id, item.row, item.category, item.product])
  );
}

// インデックスを作成・更新
function updateIndex() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
  const indexSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('インデックス') || 
    SpreadsheetApp.getActiveSpreadsheet().insertSheet('インデックス');
  
  const data = sheet.getDataRange().getValues();
  const header = ['ID', '行番号', 'カテゴリ', '商品', 'アカウント名'];
  
  // インデックスデータの作成
  const indexData = data.slice(1).map((row, i) => [
    row[2],  // ID
    i + 2,   // 行番号（ヘッダー行 + 1）
    row[22], // カテゴリ
    row[21], // 商品
    row[1]   // アカウント名
  ]);

  // インデックスシートの更新
  indexSheet.clear();
  indexSheet.getRange(1, 1, 1, header.length).setValues([header]);
  indexSheet.getRange(2, 1, indexData.length, header.length).setValues(indexData);
  
  // ソート用の範囲を設定
  const range = indexSheet.getRange(2, 1, indexData.length, header.length);
  range.sort([
    {column: 3, ascending: true},  // カテゴリでソート
    {column: 4, ascending: true}   // 商品でソート
  ]);

  // トリガーを設定（1日1回更新）
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(trigger => trigger.getHandlerFunction() === 'updateIndex')) {
    ScriptApp.newTrigger('updateIndex')
      .timeBased()
      .everyDays(1)
      .create();
  }
}