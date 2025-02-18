function doPost(e) {
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
    return ContentService.createTextOutput(JSON.stringify({
      data: [],
      total: 0,
      currentPage: 1,
      totalPages: 1,
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleInitialData(sheet, page, limit) {
  const startRow = ((page - 1) * limit) + 2;
  const numRows = Math.min(limit, sheet.getLastRow() - startRow + 1);
  
  const range = sheet.getRange(startRow, 1, numRows, 26);
  const data = range.getValues();
  const formulas = range.getFormulas();
  
  return ContentService.createTextOutput(JSON.stringify({
    data: formatRows(data, formulas),
    total: sheet.getLastRow() - 1,
    currentPage: page,
    totalPages: Math.ceil((sheet.getLastRow() - 1) / limit),
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleFilteredData(sheet, filters, page, limit) {
  console.time("Filter Process");
  const filter = Object.values(filters)[0];
  
  // 1. 一度にヘッダー行を取得
  const headers = sheet.getRange(1, 1, 1, 26).getValues()[0];
  const colIndex = headers.indexOf(filter.field) + 1;
  const lastRow = sheet.getLastRow();
  
  // 2. 検索対象の列を一度に取得
  const searchRange = sheet.getRange(2, colIndex, lastRow - 1, 1);
  const searchValues = searchRange.getValues();
  const numFilter = Number(filter.value);
  
  // 3. メモリ上で検索処理
  const matchingRows = [];
  searchValues.forEach(([value], index) => {
    const numValue = Number(value);
    if (filter.type === 'greater' && numValue >= numFilter) {
      matchingRows.push(index + 2); // 実際の行番号
    }
  });
  
  // 4. ページネーション
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, matchingRows.length);
  const pageRows = matchingRows.slice(startIndex, endIndex);
  
  if (pageRows.length === 0) {
    console.timeEnd("Filter Process");
    return ContentService.createTextOutput(JSON.stringify({
      data: [], total: 0, currentPage: page, totalPages: 0, success: true
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // 5. 必要なデータを一度に取得
  const minRow = Math.min(...pageRows);
  const maxRow = Math.max(...pageRows);
  const rowCount = maxRow - minRow + 1;
  
  // データと数式を別々に取得
  const allValues = sheet.getRange(minRow, 1, rowCount, 26).getValues();
  const thumbnailFormulas = sheet.getRange(minRow, 4, rowCount, 1).getFormulas();
  
  // 6. メモリ上でデータを整形
  const resultData = pageRows.map(rowNum => ({
    values: allValues[rowNum - minRow],
    formula: thumbnailFormulas[rowNum - minRow]
  }));
  
  console.timeEnd("Filter Process");
  return ContentService.createTextOutput(JSON.stringify({
    data: formatRows(resultData.map(r => r.values), resultData.map(r => r.formula)),
    total: matchingRows.length,
    currentPage: page,
    totalPages: Math.ceil(matchingRows.length / limit),
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
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

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}/${month}/${day}`;
}

function extractThumbnailId(formula) {
  if (!formula) return null;
  const urlMatch = formula.match(/IMAGE\("([^"]+)"/);
  if (!urlMatch) return null;
  
  const url = urlMatch[1];
  const patterns = [
    /[?&]id=([^&]+)/,
    /\/file\/d\/([^/]+)\/view/,
    /\/d\/([^/]+)(?:\/|$)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}