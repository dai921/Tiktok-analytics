function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
  const data = sheet.getDataRange().getValues();
  
  const rows = data.slice(1).map(row => ({
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
    success: true
  }))
  .setMimeType(ContentService.MimeType.JSON);
}