import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { GENRE_COLORS, DEFAULT_GENRE_COLOR } from "@/lib/constants"
import { ACCOUNT_TYPE_COLORS, CORPORATE_TYPE_COLORS, DEFAULT_ACCOUNT_TYPE_COLOR } from "@/lib/constants"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

// ハッシュタグバッジのプロパティ
export interface HashtagBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  tag: string;
  withHash?: boolean;
}

// ハッシュタグバッジコンポーネント
function HashtagBadge({ tag, className, withHash = true, ...props }: HashtagBadgeProps) {
  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200 mr-1 mb-1",
        className
      )} 
      {...props}
    >
      {withHash ? `#${tag}` : tag}
    </div>
  )
}

// ジャンルバッジのプロパティ
export interface GenreBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  genre: string;
  categoryForColor?: string;
}

// ジャンルバッジコンポーネント
function GenreBadge({ genre, categoryForColor, className, ...props }: GenreBadgeProps) {
  // カテゴリに基づいて色を決定
  // categoryForColorが指定されている場合はそれを使用し、なければgenreを使用
  const colorKey = categoryForColor || genre;
  const colors = GENRE_COLORS[colorKey as keyof typeof GENRE_COLORS] || DEFAULT_GENRE_COLOR;
  
  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold",
        className
      )}
      style={{ 
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`
      }}
      {...props}
    >
      {genre}
    </div>
  )
}

// 製品バッジのプロパティ
export interface ProductBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  product: string;
  productCategory?: string;
}

// 製品バッジコンポーネント
function ProductBadge({ product, productCategory, className, ...props }: ProductBadgeProps) {
  // 製品カテゴリに基づいて色を決定
  // カテゴリが指定されていない場合はデフォルト色を使用
  const colorKey = productCategory || 'その他';
  const colors = GENRE_COLORS[colorKey as keyof typeof GENRE_COLORS] || DEFAULT_GENRE_COLOR;
  
  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold",
        className
      )}
      style={{ 
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`
      }}
      {...props}
    >
      {product}
    </div>
  )
}

// アカウントタイプバッジのプロパティ
export interface AccountTypeBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  accountType: string;
}

// アカウントタイプバッジコンポーネント
function AccountTypeBadge({ accountType, className, ...props }: AccountTypeBadgeProps) {
  // アカウントタイプに基づいて色を決定
  // まずACCOUNT_TYPE_COLORSを確認し、見つからなければCORPORATE_TYPE_COLORSを確認
  const colors = accountType in ACCOUNT_TYPE_COLORS
    ? ACCOUNT_TYPE_COLORS[accountType as keyof typeof ACCOUNT_TYPE_COLORS]
    : accountType in CORPORATE_TYPE_COLORS
      ? CORPORATE_TYPE_COLORS[accountType as keyof typeof CORPORATE_TYPE_COLORS]
      : DEFAULT_ACCOUNT_TYPE_COLOR;
  
  return (
    <div 
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold",
        className
      )}
      style={{ 
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`
      }}
      {...props}
    >
      {accountType}
    </div>
  )
}

export { Badge, HashtagBadge, GenreBadge, ProductBadge, AccountTypeBadge, badgeVariants }
