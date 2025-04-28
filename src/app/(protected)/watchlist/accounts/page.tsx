'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AccountWatchlistPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold text-white mb-6">アカウントウォッチリスト</h1>
      
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-[#FE2C55]">お気に入りアカウント一覧</CardTitle>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <div className="bg-[#2a2a2a] p-8 rounded-md text-center text-gray-400">
                <p>ウォッチリストにアカウントはまだありません</p>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>プロフィール</TableHead>
                    <TableHead>アカウント名</TableHead>
                    <TableHead className="text-right">フォロワー数</TableHead>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead>アクション</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* アカウントリストがある場合はここに表示 */}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 