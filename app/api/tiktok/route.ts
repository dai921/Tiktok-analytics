import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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
      },
      body: JSON.stringify(body),
      redirect: 'follow',
    });

    // Handle potential redirects
    const finalResponse = response.status === 302 ? 
      await fetch(response.headers.get('location') || '', {
        method: 'GET',
        redirect: 'follow',
      }) : 
      response;

    const data = await finalResponse.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
