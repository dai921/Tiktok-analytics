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

    const response = await fetch(gasApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-cache',
    });

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
