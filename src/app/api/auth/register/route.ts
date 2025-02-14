import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const { email, password } = json;

    // TODO: Google Spreadsheetでのユーザー登録処理を実装

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Registration failed' },
      { status: 400 }
    );
  }
}