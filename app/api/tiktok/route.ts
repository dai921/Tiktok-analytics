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
    
    console.log('Calling GAS API:', gasApiUrl);
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    let response: Response;
    
    try {
      response = await fetch(gasApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'http://localhost:3000',
        },
        body: JSON.stringify(body),
        redirect: 'manual',
        cache: 'no-cache',
      });

      console.log('Initial response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.status === 302 || response.status === 301) {
        const redirectUrl = response.headers.get('location');
        console.log('Following redirect to:', redirectUrl);
        
        if (!redirectUrl) {
          throw new Error('Redirect URL not found in headers');
        }

        // Switch to GET method for the redirect
        const redirectResponse = await fetch(redirectUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Origin': 'http://localhost:3000',
          },
        });

        console.log('Redirect response status:', redirectResponse.status);
        const responseText = await redirectResponse.text();
        console.log('Redirect response body:', responseText);
        
        try {
          return NextResponse.json(JSON.parse(responseText));
        } catch (e) {
          console.error('Failed to parse JSON:', e);
          throw new Error('Invalid JSON response from GAS API');
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`GAS API returned ${response.status}: ${errorText}`);
      }

      return response;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
    
    // Handle redirect manually if needed
    if (response.status === 302 || response.status === 301) {
      const redirectUrl = response.headers.get('location');
      console.log('Following redirect to:', redirectUrl);
      if (!redirectUrl) throw new Error('Redirect URL not found');
      
      const redirectResponse = await fetch(redirectUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!redirectResponse.ok) {
        const errorText = await redirectResponse.text();
        console.error('Error after redirect:', errorText);
        throw new Error(`GAS API returned ${redirectResponse.status} after redirect: ${errorText}`);
      }
      
      return redirectResponse;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`GAS API returned ${response.status}: ${errorText}`);
    }
    
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
