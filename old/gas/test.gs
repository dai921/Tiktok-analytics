function testFilterRequest() {
  console.log('=== Testing Filter Request ===');

  // 再生数が100000以上のケース
  const viewsFilter = {
    postData: {
      contents: JSON.stringify({
        page: 1,
        filters: {
          '再生数': {
            field: '再生数',
            type: 'greater',
            value: '100000'
          }
        }
      })
    }
  };

  console.log('\nTesting views filter:');
  console.log('Request:', viewsFilter.postData.contents);
  const viewsResponse = doPost(viewsFilter);
  const viewsResult = JSON.parse(viewsResponse.getContent());
  console.log('Response:', {
    success: viewsResult.success,
    totalRows: viewsResult.total,
    returnedRows: viewsResult.data.length,
    firstRow: viewsResult.data[0]
  });

  // 日付フィルターのケース
  const dateFilter = {
    postData: {
      contents: JSON.stringify({
        page: 1,
        filters: {
          '作成日時': {
            field: '作成日時',
            type: 'after',
            value: '2024-01-01'
          }
        }
      })
    }
  };

  console.log('\nTesting date filter:');
  console.log('Request:', dateFilter.postData.contents);
  const dateResponse = doPost(dateFilter);
  const dateResult = JSON.parse(dateResponse.getContent());
  console.log('Response:', {
    success: dateResult.success,
    totalRows: dateResult.total,
    returnedRows: dateResult.data.length,
    firstRow: dateResult.data[0]
  });

  // カテゴリフィルターのケース
  const categoryFilter = {
    postData: {
      contents: JSON.stringify({
        page: 1,
        filters: {
          'カテゴリ': {
            field: 'カテゴリ',
            type: 'equal',
            value: '美容'  // 実際のカテゴリ値に合わせて変更
          }
        }
      })
    }
  };

  console.log('\nTesting category filter:');
  console.log('Request:', categoryFilter.postData.contents);
  const categoryResponse = doPost(categoryFilter);
  const categoryResult = JSON.parse(categoryResponse.getContent());
  console.log('Response:', {
    success: categoryResult.success,
    totalRows: categoryResult.total,
    returnedRows: categoryResult.data.length,
    firstRow: categoryResult.data[0]
  });
}

function testMillionViewsFilter() {
  console.log('=== Testing Million Views Filter ===');

  const millionViewsFilter = {
    postData: {
      contents: JSON.stringify({
        page: 1,
        filters: {
          '再生数': {
            field: '再生数',
            type: 'greater',
            value: '1000000'  // 100万以上
          }
        }
      })
    }
  };

  console.log('Request:', millionViewsFilter.postData.contents);
  const response = doPost(millionViewsFilter);
  const result = JSON.parse(response.getContent());

  console.log('\nResponse Overview:', {
    success: result.success ? '✅' : '❌',
    totalRows: result.total,
    returnedRows: result.data.length
  });

  if (result.data.length > 0) {
    console.log('\nFiltered Videos:');
    result.data.forEach((row, index) => {
      console.log(`\nVideo ${index + 1}:`, {
        accountName: row.accountName,
        views: row.views.toLocaleString() + '回',
        viewsIncrease: row.viewsIncrease.toLocaleString() + '回',
        createdAt: row.createdAt,
        category: row.category,
        url: row.url
      });
    });
  } else {
    console.log('❌ No videos found with over 1 million views');
  }
}

function testDateFormat() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('動画データ');
  const allValues = sheet.getDataRange().getValues();
  const headers = allValues[0];
  
  // 作成日時のカラムインデックスを取得
  const dateColIndex = headers.indexOf('作成日時');
  
  // 最初の5行の日付データを確認
  const sampleDates = allValues.slice(1, 6).map(row => ({
    rawValue: row[dateColIndex],
    type: typeof row[dateColIndex],
    toString: String(row[dateColIndex])
  }));
  
  console.log('Date Column Index:', dateColIndex);
  console.log('Sample Dates:', JSON.stringify(sampleDates, null, 2));
} 