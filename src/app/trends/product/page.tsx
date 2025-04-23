'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ProductTrendsPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">商材トレンド分析</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="categories">カテゴリー別</TabsTrigger>
          <TabsTrigger value="products">商品別</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>商材トレンド概要</CardTitle>
            </CardHeader>
            <CardContent>
              {/* ここに概要のコンテンツを追加 */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>カテゴリー別トレンド</CardTitle>
            </CardHeader>
            <CardContent>
              {/* ここにカテゴリー別のコンテンツを追加 */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>商品別トレンド</CardTitle>
            </CardHeader>
            <CardContent>
              {/* ここに商品別のコンテンツを追加 */}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 