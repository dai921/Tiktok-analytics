function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
}

function doPost(e) {
  const startTime = new Date();
  Logger.log('Request started at: ' + startTime);

  // Handle CORS preflight
  if (e.method === 'OPTIONS') {
    return ContentService.createTextOutput('')
      .setMimeType(ContentService.MimeType.TEXT)
      .addHeader('Access-Control-Allow-Origin', '*')
      .addHeader('Access-Control-Allow-Methods', 'POST')
      .addHeader('Access-Control-Allow-Headers', 'Content-Type')
      .addHeader('Access-Control-Max-Age', '86400');
  }

  // Create response
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  output.addHeader('Access-Control-Allow-Origin', '*');
  
  try {
    // Parse request
    const params = JSON.parse(e.postData.contents);
    const page = parseInt(params.page) || 1;
    const limit = params.limit || 50;
    
    // Get sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
    if (!sheet) {
      throw new Error('Sheet not found');
    }
    
    // Process request
    const result = params.filters ? 
      handleFilteredData(sheet, params.filters, page, limit) :
      handleInitialData(sheet, page, limit);
    
    // Set response
    output.setContent(JSON.stringify({
      success: true,
      ...result
    }));

  // Log the request method and content
  Logger.log('Request method: ' + e.method);
  Logger.log('Request content: ' + e.postData.contents);

  try {
    // Log request for debugging
    Logger.log('Request received: ' + JSON.stringify(e.postData.contents));
    
    // Parse request
    const params = JSON.parse(e.postData.contents);
    const page = parseInt(params.page) || 1;
    const limit = params.limit || 50;
    
    // Access spreadsheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new Error('Unable to access spreadsheet');
    }
    
    const sheet = spreadsheet.getSheetByName('動画データ');
    if (!sheet) {
      throw new Error('Sheet 動画データ not found');

  const params = JSON.parse(e.postData.contents);
  const page = parseInt(params.page) || 1;
  const limit = params.limit || 50;
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
  
  try {
    if (params.filters) {
      return handleFilteredData(sheet, params.filters, page, limit);
    }
    
    return handleInitialData(sheet, page, limit);
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    output.setContent(JSON.stringify({
      success: false,
      error: error.toString(),
      data: [],
      total: 0,
      currentPage: 1,
      totalPages: 1
    }));
  }
  
  const endTime = new Date();
  const executionTime = (endTime - startTime) / 1000;
  Logger.log('Total execution time: ' + executionTime + ' seconds');
  return output;
  }
}

function handleInitialData(sheet, page, limit) {
  console.time("Initial Data Load");
  const startRow = ((page - 1) * limit) + 2;
  const numRows = Math.min(limit, sheet.getLastRow() - startRow + 1);
  
  // Get data in a single batch operation
  const range = sheet.getRange(startRow, 1, numRows, 8);
  const data = range.getValues();
  
  // Get thumbnail formulas separately
  const thumbnailRange = sheet.getRange(startRow, 4, numRows, 1);
  const formulas = thumbnailRange.getFormulas();
  
  // Transform data efficiently
  const rows = data.map((row, index) => ({
    url: String(row[0]),
    accountName: String(row[1]),
    videoId: String(row[2]),
    thumbnail: extractThumbnailId(formulas[index][0]) ? {
      valueType: 'IMAGE',
      url: `https://lh3.googleusercontent.com/d/${extractThumbnailId(formulas[index][0])}`
    } : null,
    views: Number(row[6]),
    likes: Number(row[5]),
    comments: Number(row[7])
  }));
  
  console.timeEnd("Initial Data Load");
  return ContentService.createTextOutput(JSON.stringify({
    data: rows,
    total: sheet.getLastRow() - 1,
    currentPage: page,
    totalPages: Math.ceil((sheet.getLastRow() - 1) / limit),
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
}

// フィールドの種類を定義
const FIELD_TYPES = {
  // 日付フィールド
  DATE_FIELDS: [
    'createdAt',
    'prevFetchDate',
    'currentFetchDate'
  ],
  // 数値フィールド
  NUMBER_FIELDS: [
    'views',
    'likes',
    'comments',
    'shares',
    'saves',
    'duration',
    'prevViews',
    'viewsIncrease',
    'prevLikes',
    'likesIncrease'
  ]
};

function handleFilteredData(sheet, filters, page, limit) {
  console.time("Filter Process");
  const filter = Object.values(filters)[0];
  
  // 1. Get headers and find filter column
  const headers = sheet.getRange(1, 1, 1, 26).getValues()[0];
  const colIndex = headers.indexOf(filter.field) + 1;
  const lastRow = sheet.getLastRow();
  
  // 2. Get search column data in one batch
  const searchRange = sheet.getRange(2, colIndex, lastRow - 1, 1);
  const searchValues = searchRange.getValues();
  const numFilter = Number(filter.value);
    
  // 3. Find matching rows in memory
  const matchingRows = [];
  searchValues.forEach(([value], index) => {
    const numValue = Number(value);
    if (filter.type === 'greater' && numValue > numFilter) {
      matchingRows.push(index + 2); // Add 2 to account for header row
    }
  });
    
  // 4. Apply pagination
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, matchingRows.length);
  const pageRows = matchingRows.slice(startIndex, endIndex);
  
  if (pageRows.length === 0) {
    console.timeEnd("Filter Process");
    return ContentService.createTextOutput(JSON.stringify({
      data: [],
      total: 0,
      currentPage: page,
      totalPages: 0,
      success: true
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // 5. Get required data efficiently
  const minRow = Math.min(...pageRows);
  const maxRow = Math.max(...pageRows);
  const rowCount = maxRow - minRow + 1;
  
  // Get data and formulas in one batch
  const allValues = sheet.getRange(minRow, 1, rowCount, 8).getValues();
  const thumbnailFormulas = sheet.getRange(minRow, 4, rowCount, 1).getFormulas();
  
  // 6. Transform data efficiently
  const resultData = pageRows.map(rowNum => ({
    values: allValues[rowNum - minRow],
    formula: thumbnailFormulas[rowNum - minRow]
  }));
  
  // 7. Format response
  const rows = resultData.map(({ values, formula }) => ({
    url: String(values[0]),
    accountName: String(values[1]),
    videoId: String(values[2]),
    thumbnail: extractThumbnailId(formula[0]) ? {
      valueType: 'IMAGE',
      url: `https://lh3.googleusercontent.com/d/${extractThumbnailId(formula[0])}`
    } : null,
    views: Number(values[6]),
    likes: Number(values[5]),
    comments: Number(values[7])
  }));
  
  console.timeEnd("Filter Process");
  return ContentService.createTextOutput(JSON.stringify({
    data: rows,
    total: matchingRows.length,
    currentPage: page,
    totalPages: Math.ceil(matchingRows.length / limit),
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
    
    // If we found matches, get only those rows' data
    if (matchingRowIndices.length > 0) {
      // Calculate continuous ranges for better performance
      const continuousRanges = matchingRowIndices.reduce((acc, index, i) => {
        if (i === 0 || index !== matchingRowIndices[i - 1] + 1) {
          acc.push([index]);
        } else {
          acc[acc.length - 1].push(index);
        }
        return acc;
      }, []);
      
      // Implement efficient range batching
      function batchGetRanges(sheet, indices, columns, baseRow) {
        // Group consecutive indices for efficient range operations
        const ranges = indices.reduce((acc, index, i) => {
          if (i === 0 || index !== indices[i - 1] + 1) {
            acc.push([index]);
          } else {
            acc[acc.length - 1].push(index);
          }
          return acc;
        }, []).map(group => 
          columns.map(col => 
            sheet.getRange(
              baseRow + group[0],
              col,
              group.length,
              1
            ).getA1Notation()
          )
        ).flat();
        
        return sheet.getRangeList(ranges).getRanges()
          .map(range => range.getValues());
      }
      
      // Use batch range operations
      const rangeData = batchGetRanges(
        sheet,
        matchingRowIndices,
        requiredColumns,
        cursor.startRow
      );
      
      // Batch get all required data
      const rangeList = sheet.getRangeList(ranges);
      const rangeData = rangeList.getRanges();
      const data = [];
      const thumbnailFormulas = [];
      
      // Process data in continuous blocks
      let dataIndex = 0;
      continuousRanges.forEach(indices => {
        const blockData = requiredColumns.map((___, colIndex) => 
          rangeData[dataIndex + colIndex].getValues()
        );
        data.push(...blockData);
        thumbnailFormulas.push(rangeData[dataIndex + 3].getFormulas());
        dataIndex += requiredColumns.length;
      });
      // Transform data to row format more efficiently
      let rowIndex = 0;
      const rows = [];
      continuousRanges.forEach((indices, blockIndex) => {
        indices.forEach((__, i) => {
          rows.push({
            url: String(data[blockIndex * requiredColumns.length][i][0]),
            accountName: String(data[blockIndex * requiredColumns.length + 1][i][0]),
            videoId: String(data[blockIndex * requiredColumns.length + 2][i][0]),
            thumbnail: thumbnails[indices[i]].id ? {
              valueType: 'IMAGE',
              url: thumbnails[indices[i]].url
            } : null,
            views: Number(data[blockIndex * requiredColumns.length + 4][i][0]),
            likes: Number(data[blockIndex * requiredColumns.length + 5][i][0]),
            comments: Number(data[blockIndex * requiredColumns.length + 6][i][0])
          });
          rowIndex++;
        });
      });
  );

  // 高速化されたソート処理
  const sortFilters = Object.entries(filters).filter(([_, filter]) => filter.type === 'sort');
  if (sortFilters.length > 0) {
    filteredRows.sort((a, b) => {
      for (const [field, filter] of sortFilters) {
        const colIndex = indexHeaders.indexOf(COLUMN_MAP[field] || field);
        if (colIndex === -1) continue;
        
        const aVal = a[colIndex];
        const bVal = b[colIndex];
        
        if (aVal === bVal) continue;
        
        const comparison = filter.value === 'asc' ? 
          (typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal) :
          (typeof aVal === 'string' ? bVal.localeCompare(aVal) : bVal - aVal);
        
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
  }

  const startIndex = (page - 1) * limit;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + limit);
  
  // 数式の取得
  const formulas = paginatedRows.map(row => {
    const rowIndex = data.findIndex(r => r[2] === row[2]); // videoIdで行を特定
    return sheet.getRange(rowIndex + 1, 1, 1, headers.length).getFormulas()[0];
  });

  response.setContent(JSON.stringify({
    data: formatRows(paginatedRows, formulas),
    total: filteredRows.length,
    currentPage: page,
    totalPages: Math.ceil(filteredRows.length / limit),
    success: true
  }));
  return response;
}

// フィルター評価のヘルパー関数
function evaluateFilter(value, filter) {
  const rowValue = typeof value === 'string' ? value.trim() : value;
  const filterValue = filter.value;
  
  // 日付フィールドの場合
  if (filter.fieldType === 'date') {
    const rowDate = new Date(rowValue);
    const filterDate = new Date(filterValue);
    
    switch (filter.type) {
      case 'after':  return rowDate >= filterDate;
      case 'before': return rowDate <= filterDate;
      default:       return rowDate.toDateString() === filterDate.toDateString();
    }
  }
  
  // 数値フィールドの場合
  if (typeof rowValue === 'number' || !isNaN(Number(rowValue))) {
    const numValue = Number(rowValue);
    const numFilter = Number(filterValue);
    
    switch (filter.type) {
      case 'gte':    return numValue >= numFilter;
      case 'lte':    return numValue <= numFilter;
      case 'greater': return numValue > numFilter;
      case 'less':    return numValue < numFilter;
      default:        return numValue === numFilter;
    }
  }
  
  // 文字列の場合
  return String(rowValue).toLowerCase() === String(filterValue).toLowerCase();
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

// Optimize thumbnail processing with caching and single regex
function extractThumbnailId(formula) {
  if (!formula) return null;
  
  const urlMatch = formula.match(/IMAGE\("([^"]+)"/);
  if (!urlMatch) return null;
  
  const url = urlMatch[1];
  // Combined pattern for better performance
  const idMatch = url.match(/(?:[?&]id=|\/file\/d\/|\/d\/)([^/&]+)/);
  return idMatch ? idMatch[1] : null;
}

// Batch process thumbnails for better performance
function getThumbnailBatch(sheet, startRow, numRows) {
  const thumbnailRange = sheet.getRange(startRow, 4, numRows, 1);
  const formulas = thumbnailRange.getFormulas();
  return formulas.map(([formula]) => ({
    id: extractThumbnailId(formula),
    url: formula ? `https://lh3.googleusercontent.com/d/${extractThumbnailId(formula)}` : null
  }));
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('インデックス');
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
