import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const startTime = Date.now();
  console.log('API request started at:', new Date(startTime).toISOString());
  
  try {
    const body = await request.json();
    const gasApiUrl = process.env.NEXT_PUBLIC_GAS_API_URL;

    if (!gasApiUrl) {
      throw new Error('GAS API URL is not configured');
    }

    console.log('Calling GAS API:', gasApiUrl);
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    const response = await fetch(gasApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-cache',
    });
    
    console.log('Response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`GAS API returned ${response.status}: ${errorText}`);
    }

    // Handle potential redirects
    const finalResponse = response.status === 302 ? 
      await fetch(response.headers.get('location') || '', {
        method: 'GET',
        redirect: 'follow',
      }) : 
      response;

    const data = await finalResponse.json();
    const endTime = Date.now();
    const executionTime = (endTime - startTime) / 1000;
    console.log('API request completed in:', executionTime, 'seconds');
    return NextResponse.json({
      ...data,
      _debug: {
        executionTime
      }
    });
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
