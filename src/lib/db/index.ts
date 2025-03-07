import mysql from 'mysql2/promise';

// データベース接続プールの作成
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export { pool };

// ユーザー関連のクエリ
export const userQueries = {
  // ユーザーをメールアドレスで検索
  findByEmail: async (email: string) => {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0];
  },

  // 新規ユーザーの作成
  create: async (user: { id: string; email: string; password: string; name?: string }) => {
    const [result] = await pool.execute(
      'INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)',
      [user.id, user.email, user.password, user.name]
    );
    return result;
  }
};

// セッション関連のクエリ
export const sessionQueries = {
  // セッションの作成
  create: async (session: { id: string; userId: string; token: string; expires: Date }) => {
    const [result] = await pool.execute(
      'INSERT INTO sessions (id, user_id, session_token, expires) VALUES (?, ?, ?, ?)',
      [session.id, session.userId, session.token, session.expires]
    );
    return result;
  },

  // セッショントークンでセッションを検索
  findByToken: async (token: string) => {
    const [rows] = await pool.execute(
      'SELECT * FROM sessions WHERE session_token = ? AND expires > NOW()',
      [token]
    );
    return rows[0];
  },

  // セッションの削除（ログアウト時）
  deleteByToken: async (token: string) => {
    const [result] = await pool.execute(
      'DELETE FROM sessions WHERE session_token = ?',
      [token]
    );
    return result;
  }
}; 