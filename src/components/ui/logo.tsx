export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 200 50" 
      className={className}
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{stopColor: '#0EA5E9', stopOpacity: 1}} />
          <stop offset="100%" style={{stopColor: '#38BDF8', stopOpacity: 1}} />
        </linearGradient>
      </defs>
      <circle cx="25" cy="25" r="20" fill="url(#gradient)"/>
      <path d="M15 25 L20 20 L30 30 L40 15" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <text x="55" y="32" fontSize="20" fill="#0F172A" fontWeight="bold">
        <tspan fill="#0EA5E9">Tik</tspan>Analytics
      </text>
    </svg>
  )
}