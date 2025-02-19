'use client';

import React, { useState, useEffect } from 'react';

interface VideoData {
  id: string;
  url: string;
  accountName: string;
  thumbnail: {
    valueType: 'IMAGE';
    url: string;
  } | null;
  views: number;
  likes: number;
  comments: number;
}

interface ApiResponse {
  data: VideoData[];
  total: number;
  currentPage: number;
  totalPages: number;
  success: boolean;
  error?: string;
  _debug?: {
    executionTime: number;
  };
}

export default function Home() {
  const [data, setData] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [executionTime, setExecutionTime] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [currentPage]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/tiktok', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page: currentPage,
          filters: {
            "再生数": {
              field: "再生数",
              type: "greater",
              value: "1000000"
            }
          }
        }),
      });

      const result: ApiResponse = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result.data);
      setTotalPages(result.totalPages);
      setExecutionTime(result._debug?.executionTime || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">TikTok Analytics</h1>
      
      {executionTime && (
        <p className="text-sm text-gray-600 mb-4">
          Request completed in {executionTime.toFixed(3)} seconds
        </p>
      )}

      {error ? (
        <div className="text-red-500 mb-4">{error}</div>
      ) : loading ? (
        <div className="text-gray-600">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((video) => (
              <div key={video.id} className="border rounded-lg p-4">
                {video.thumbnail && (
                  <img 
                    src={video.thumbnail.url} 
                    alt={`Thumbnail for ${video.accountName}`}
                    className="w-full h-48 object-cover rounded-lg mb-2"
                  />
                )}
                <h2 className="font-semibold">{video.accountName}</h2>
                <div className="text-sm text-gray-600">
                  <p>Views: {video?.views?.toLocaleString() || '0'}</p>
                  <p>Likes: {video?.likes?.toLocaleString() || '0'}</p>
                  <p>Comments: {video?.comments?.toLocaleString() || '0'}</p>
                </div>
                <a 
                  href={video.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 text-sm mt-2 block"
                >
                  View on TikTok
                </a>
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-4 py-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
