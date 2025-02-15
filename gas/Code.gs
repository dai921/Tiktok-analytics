function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('シート名');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const rows = data.slice(1).map(row => ({
    id: row[0],
    date: row[1],
    views: row[2],
    viewsPrev: row[3],
    viewsIncrease: row[4],
    genre: row[5],
    url: row[6],
    accountName: row[7],
    likes: row[8],
    comments: row[9],
    hashtags: row[10].split(','),
    bgm: row[11],
    transcript: row[12]
  }));

  return ContentService.createTextOutput(JSON.stringify({
    data: rows,
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
} 