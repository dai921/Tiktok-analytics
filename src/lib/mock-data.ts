export interface VideoData {
  id: number
  thumbnail: string
  date: string
  views: number
  viewsPrev: number
  viewsIncrease: number
  genre: string
  url: string
  accountName: string
  likes: number
  comments: number
  hashtags: string[]
  bgm: string
  transcript: string
}

export const mockData: VideoData[] = [
  {
    id: 1,
    thumbnail: '/dummy1.jpg',
    date: '2024-03-20',
    views: 1000,
    viewsPrev: 800,
    viewsIncrease: 200,
    genre: 'スキンケア',
    url: 'https://tiktok.com/...',
    accountName: '@beauty_tips',
    likes: 100,
    comments: 50,
    hashtags: ['#スキンケア', '#美容'],
    bgm: 'Original Sound - beauty_tips',
    transcript: 'こんにちは！今日は私のスキンケアルーティン...',
  },
  {
    id: 2,
    thumbnail: '/dummy2.jpg',
    date: '2024-03-21',
    views: 2000,
    viewsPrev: 1800,
    viewsIncrease: 200,
    genre: 'ヘアケア',
    url: 'https://tiktok.com/video2',
    accountName: '@hair_salon',
    likes: 200,
    comments: 75,
    hashtags: ['#ヘアケア', '#髪質改善'],
    bgm: 'Popular Song - artist_name',
    transcript: '髪の毛の乾かし方で、こんなに変わります！まず最初に...',
  },
] 