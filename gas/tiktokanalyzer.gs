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
}

function extractThumbnailId(formula) {
  if (!formula) return null;
  const urlMatch = formula.match(/IMAGE\("([^"]+)"/);
  if (!urlMatch) return null;
  
  const url = urlMatch[1];
  // Combined pattern for better performance
  const idMatch = url.match(/(?:[?&]id=|\/file\/d\/|\/d\/)([^/&]+)/);
  return idMatch ? idMatch[1] : null;
}
