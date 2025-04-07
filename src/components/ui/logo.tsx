import Image from 'next/image'

type LogoProps = {
  className?: string;
  variant?: 'auth' | 'sidebar';
}

export function Logo({ className = '', variant = 'sidebar' }: LogoProps) {
  const logoSrc = variant === 'auth' 
    ? '/images/buzzmiru_logo_color_white.png'
    : '/images/buzzmiru_logo_no_jp.png';

  // variantに応じてサイズと配置を調整
  const containerStyles = variant === 'auth'
    ? 'flex items-center justify-center gap-3'  // 認証画面用：中央寄せ、大きめの間隔
    : 'flex items-center gap-1';  // サイドバー用：左寄せ、コンパクトな間隔

  const iconSize = variant === 'auth' ? 80 : 60;  // 認証画面ではアイコンを大きく
  const logoWidth = variant === 'auth' ? 240 : 160;  // 認証画面ではロゴを大きく
  const logoHeight = variant === 'auth' ? 60 : 40;

  return (
    <div className={`${containerStyles} ${className}`}>
      <Image
        src="/images/icon.png"
        alt="BuzzMiru Icon"
        width={iconSize}
        height={iconSize}
        priority
        className="object-contain"
      />
      <Image
        src={logoSrc}
        alt="BuzzMiru Logo"
        width={logoWidth}
        height={logoHeight}
        priority
        className="object-contain"
      />
    </div>
  )
}