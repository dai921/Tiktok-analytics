import { compare, hash } from 'bcryptjs';
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { sessionQueries, userQueries } from '../db';

// パスワードのハッシュ化
export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

// パスワードの検証
export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return compare(password, hashedPassword);
}

// セッションの作成
export async function createSession(userId: string) {
  const sessionToken = uuidv4();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30); // 30日後に有効期限切れ

  await sessionQueries.create({
    id: uuidv4(),
    userId,
    token: sessionToken,
    expires,
  });

  // セッションクッキーの設定
  cookies().set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
  });

  return sessionToken;
}

// 現在のセッションの取得
export async function getSession() {
  const sessionToken = cookies().get('session')?.value;
  
  if (!sessionToken) {
    return null;
  }

  const session = await sessionQueries.findByToken(sessionToken);
  
  if (!session) {
    return null;
  }

  return session;
}

// セッションの削除（ログアウト）
export async function deleteSession() {
  const sessionToken = cookies().get('session')?.value;
  
  if (sessionToken) {
    await sessionQueries.deleteByToken(sessionToken);
    cookies().delete('session');
  }
} 