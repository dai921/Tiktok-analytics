'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/logo'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function Home() {
 const router = useRouter()
 const [isLoading, setIsLoading] = useState(false)
 const [error, setError] = useState('')

 async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
   event.preventDefault()
   setIsLoading(true)
   setError('')

   const formData = new FormData(event.currentTarget)
   const email = formData.get('email')
   const password = formData.get('password')

   try {
     const response = await fetch('/api/auth/login', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ email, password }),
     })

     if (!response.ok) {
       throw new Error('ログインに失敗しました')
     }

     const data = await response.json()
     localStorage.setItem('apiKey', data.apiKey)
     router.push('/dashboard')

   } catch (error) {
     setError('ログインに失敗しました')
   } finally {
     setIsLoading(false)
   }
 }

 return (
   <div className="min-h-screen w-full flex items-center justify-center bg-sky-50 p-4">
     <Card className="w-[500px] shadow-lg">
       <CardHeader className="pb-2">
         <div className="w-full flex justify-center py-4">
           <Logo />
         </div>
       </CardHeader>
       <CardContent>
         <form onSubmit={onSubmit} className="space-y-3">
           <div className="space-y-1">
             <Label htmlFor="email" className="text-sky-900">メールアドレス</Label>
             <Input
               id="email"
               name="email"
               placeholder="example@example.com"
               type="email"
               required
               className="h-12"
             />
           </div>
           <div className="space-y-1">
             <Label htmlFor="password" className="text-sky-900">パスワード</Label>
             <Input
               id="password"
               name="password"
               type="password"
               required
               className="h-12"
             />
           </div>

           {error && (
             <p className="text-sm text-red-500">
               {error}
             </p>
           )}

           <div className="space-y-2 pt-4">
             <Button 
               type="submit"
               className="w-full h-12 text-lg bg-sky-600 hover:bg-sky-700"
               disabled={isLoading}
             >
               {isLoading ? 'ログイン中...' : 'ログイン'}
             </Button>
             <Button 
               type="button"
               variant="outline" 
               className="w-full h-12 text-lg text-sky-600 border-sky-600 hover:bg-sky-50"
               onClick={() => router.push('/register')}
             >
               新規登録
             </Button>
           </div>
         </form>
       </CardContent>
     </Card>
   </div>
 )
}