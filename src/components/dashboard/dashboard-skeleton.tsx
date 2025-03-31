export default function DashboardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="h-64 bg-gray-200 rounded mb-4"></div>
        <div className="flex justify-between">
          <div className="h-6 bg-gray-200 rounded w-24"></div>
          <div className="h-6 bg-gray-200 rounded w-24"></div>
        </div>
      </div>
    </div>
  );
} 