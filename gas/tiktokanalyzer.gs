// 定数を上部にまとめる
const SHEET_NAME = '動画データ';
const INDEX_SHEET_NAME = 'インデックス';

// フィールドの種類を定義
const FIELD_TYPES = {
  DATE_FIELDS: ['createdAt', 'prevFetchDate', 'currentFetchDate'],
  NUMBER_FIELDS: [
    '再生数', 'いいね数', 'コメント数', '共有数', '保存数',
    '動画時間(秒)', '前回再生数', '再生数伸び', '前回いいね数', 'いいね数伸び'
  ]
};

// フィルタータイプの定義
const FILTER_TYPES = {
  GREATER: 'greater',
  LESS: 'less',
  EQUAL: 'equal',
  AFTER: 'after',
  BEFORE: 'before',
  SORT: 'sort'
};

// メイン関数をシンプルに
function doPost(e) {
  try {
    const { page = 1, limit = 50, filters } = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    
    return ContentService.createTextOutput(
      JSON.stringify(
        filters ? handleFilteredData(sheet, filters, page, limit) : handleInitialData(sheet, page, limit)
      )
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return handleError(error);
  }
}

// エラーハンドリングを分離
function handleError(error) {
  return ContentService.createTextOutput(JSON.stringify({
    data: [],
    total: 0,
    currentPage: 1,
    totalPages: 1,
    success: false,
    error: error.toString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// フィルター処理を分離
function applyFilter(row, filter, headers) {
  const { field, type, value } = filter;
  const colIndex = headers.indexOf(field);
  const rowValue = row[colIndex];

  if (FIELD_TYPES.DATE_FIELDS.includes(field)) {
    return handleDateFilter(rowValue, value, type);
  }
  
  if (FIELD_TYPES.NUMBER_FIELDS.includes(field)) {
    return handleNumberFilter(rowValue, value, type);
  }
  
  return handleTextFilter(rowValue, value);
}

function handleInitialData(sheet, page, limit) {
  try {
    const startRow = ((page - 1) * limit) + 2;  // ヘッダー行をスキップ
    const numRows = Math.min(limit, sheet.getLastRow() - startRow + 1);
    
    // データ範囲の取得を1回に
    const range = sheet.getRange(startRow, 1, numRows, 26);
    const data = range.getValues();
    const formulas = range.getFormulas();
    
    const rows = formatRows(data, formulas);
    
    return {
      data: rows,
      total: sheet.getLastRow() - 1,
      currentPage: page,
      totalPages: Math.ceil((sheet.getLastRow() - 1) / limit),
      success: true  // successフラグを追加
    };
  } catch (error) {
    console.error('Error in handleInitialData:', error);
    return handleError(error);
  }
}

function handleFilteredData(sheet, filters, page, limit) {
  try {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const filteredRows = data.slice(1).filter(row => 
      Object.entries(filters).every(([field, filter]) => {
        const colIndex = headers.indexOf(filter.field);
        if (colIndex === -1) return false;

        const value = row[colIndex];
        const rowValue = typeof value === 'string' ? value.trim() : value;
        const filterValue = filter.value;

        // 数値フィールドの場合
        if (FIELD_TYPES.NUMBER_FIELDS.includes(filter.field)) {
          const numValue = Number(rowValue);
          const numFilter = Number(filterValue);
          
          switch (filter.type) {
            case FILTER_TYPES.GREATER: return numValue >= numFilter;
            case FILTER_TYPES.LESS: return numValue <= numFilter;
            case FILTER_TYPES.EQUAL: return numValue === numFilter;
            default: return false;
          }
        }
        
        // その他のフィールド（文字列等）の場合
        return String(rowValue).toLowerCase() === String(filterValue).toLowerCase();
      })
    );

    // ソート処理
    const sortFilter = Object.entries(filters).find(([_, filter]) => filter.type === 'sort');
    if (sortFilter) {
      const [field, filter] = sortFilter;
      const colIndex = headers.indexOf(field);
      filteredRows.sort((a, b) => {
        const aVal = a[colIndex];
        const bVal = b[colIndex];
        return filter.value === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    const startIndex = (page - 1) * limit;
    const paginatedRows = filteredRows.slice(startIndex, startIndex + limit);
    
    // 数式の取得
    const formulas = paginatedRows.map(row => {
      const rowIndex = data.findIndex(r => r[2] === row[2]); // videoIdで行を特定
      return sheet.getRange(rowIndex + 1, 1, 1, headers.length).getFormulas()[0];
    });

    return {
      data: formatRows(paginatedRows, formulas),
      total: filteredRows.length,
      currentPage: page,
      totalPages: Math.ceil(filteredRows.length / limit),
      success: true
    };
  } catch (error) {
    console.error('Error in handleFilteredData:', error);
    return handleError(error);
  }
}

function formatRows(data, formulas) {
  return data.map((row, index) => ({
    id: String(row[2]),
    url: String(row[0]),
    accountName: String(row[1]),
    videoId: String(row[2]),
    thumbnail: extractThumbnailId(formulas[index][3]) ? {
      valueType: 'IMAGE',
      url: `https://lh3.googleusercontent.com/d/${extractThumbnailId(formulas[index][3])}`
    } : null,
    authorName: String(row[4]),
    description: String(row[5]),
    likes: Number(row[6]),
    views: Number(row[7]),
    comments: Number(row[8]),
    shares: Number(row[9]),
    saves: Number(row[10]),
    createdAt: formatDate(row[11]),
    hashtags: String(row[12]).split(',').map(tag => tag.trim()),
    duration: Number(row[13]),
    isViral: row[14] === 'TRUE',
    prevFetchDate: formatDate(row[15]),
    currentFetchDate: formatDate(row[16]),
    prevViews: Number(row[17]),
    viewsIncrease: Number(row[18]),
    prevLikes: Number(row[19]),
    likesIncrease: Number(row[20]),
    product: String(row[21]),
    category: String(row[22]),
    audioId: String(row[23]),
    audioTitle: String(row[24]),
    artist: String(row[25])
  }));
}

// 日付フォーマット用のヘルパー関数
function formatDate(dateStr) {
  if (!dateStr) return '';
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;  // 無効な日付の場合は元の文字列を返す
  
  const year = date.getFullYear().toString().slice(-2);  // YY
  const month = (date.getMonth() + 1).toString().padStart(2, '0');  // MM
  const day = date.getDate().toString().padStart(2, '0');  // DD
  
  return `${year}/${month}/${day}`;
}

function extractThumbnailId(formula) {
  if (!formula) return null;
  
  const urlMatch = formula.match(/IMAGE\("([^"]+)"/);
  if (!urlMatch) return null;
  
  const url = urlMatch[1];
  
  const patterns = [
    /[?&]id=([^&]+)/,                 // uc?export=view形式
    /\/file\/d\/([^/]+)\/view/,       // file/d形式
    /\/d\/([^/]+)(?:\/|$)/            // 直接d/形式
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// カラム名のマッピングを定義
const COLUMN_MAP = {
  'views': '再生数',
  'likes': 'いいね数',
  'comments': 'コメント数',
  'accountName': 'アカウント名',
  'category': 'カテゴリ',
  'hashtags': 'ハッシュタグ',
  'description': '説明',
  'audioTitle': '音声タイトル',
  'url': 'URL',
  'videoId': '動画ID',
  'thumbnail': 'カバー画像',
  'authorName': '作成者表示名',
  'shares': '共有数',
  'saves': '保存数',
  'createdAt': '作成日時',
  'duration': '動画時間(秒)',
  'isViral': '10万再生以上',
  'prevFetchDate': '前回取得日',
  'currentFetchDate': '今回取得日',
  'prevViews': '前回再生数',
  'viewsIncrease': '再生数伸び',
  'prevLikes': '前回いいね数',
  'likesIncrease': 'いいね数伸び',
  'product': '商材',
  'audioId': '音声ID',
  'artist': 'アーティスト'
};

function findMatchingRows(sheet, filters, page, limit) {
  // シート上でフィルタを適用して該当行を見つける
  // 例：views >= 1000 なら、その条件に合う行を探す
  const startRow = (page - 1) * limit + 2;  // ヘッダー行を考慮
  return sheet.getRange(startRow, 1, limit, 26);
}

// 定期的にデータを更新（例：1時間ごと）
function updateCache() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const indexSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INDEX_SHEET_NAME) || 
    SpreadsheetApp.getActiveSpreadsheet().insertSheet(INDEX_SHEET_NAME);
  
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const indexSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INDEX_SHEET_NAME) || 
    SpreadsheetApp.getActiveSpreadsheet().insertSheet(INDEX_SHEET_NAME);
  
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

function getThumbnailUrl(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    // 既に適切な権限が設定されているので、URLのみ返す
    return `https://lh3.googleusercontent.com/d/${fileId}`;  // より信頼性の高いURLフォーマット
  } catch (error) {
    console.error('Error getting thumbnail URL:', error);
    return null;
  }
}

// よく検索される列のインデックスを作成
function createSearchIndex() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INDEX_SHEET_NAME);
  // ... インデックス作成のロジック
}

// フィルタ条件に一致する行数をカウント
function countMatchingRows(sheet, filters) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).filter(row => 
    Object.entries(filters).every(([field, filter]) => {
      const colIndex = headers.indexOf(field);
      const value = row[colIndex];
      
      switch (filter.type) {
        case 'greater': return Number(value) >= Number(filter.value);
        case 'less': return Number(value) <= Number(filter.value);
        case 'equal': return value === filter.value;
        default: return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      }
    })
  ).length;
}