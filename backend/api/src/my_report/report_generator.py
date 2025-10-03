from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Iterable, Optional, Sequence

from pptx import Presentation
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

from .models import TikTokStats, TikTokVideo


def _format_number(value: Optional[int]) -> str:
    if value is None:
        return "-"
    return f"{value:,}"


def _format_float(value: Optional[float], digits: int = 1) -> str:
    if value is None:
        return "-"
    return f"{value:.{digits}f}"


def _ensure_datetime(value: datetime | None) -> datetime:
    return value or datetime.now()


def _top_videos(videos: Sequence[TikTokVideo], limit: int = 5) -> Iterable[TikTokVideo]:
    return sorted(videos, key=lambda v: v.viewCount, reverse=True)[:limit]


def build_tiktok_report_presentation(
    *,
    stats: TikTokStats,
    videos: Sequence[TikTokVideo],
    account_name: str,
    period_label: str,
    start_date: datetime,
    end_date: datetime,
    generated_at: Optional[datetime] = None,
) -> BytesIO:
    """Generate a minimal TikTok PowerPoint report preview.

    This focuses on the cover page and an executive summary slide so that
    we can iterate on the layout/templating before filling in the full
    32ページ構成. Later revisions can replace the programmatic layout with
    a dedicated .pptx template.
    """

    generated_at = _ensure_datetime(generated_at)

    presentation = Presentation()

    # --- Cover slide ---
    cover = presentation.slides.add_slide(presentation.slide_layouts[0])
    cover_title = cover.shapes.title
    cover_subtitle = cover.placeholders[1]

    cover_title.text = f"TikTok レポート"
    cover_subtitle.text = (
        f"アカウント: {account_name}\n"
        f"対象期間: {start_date:%Y/%m/%d} – {end_date:%Y/%m/%d} ({period_label})\n"
        f"作成日: {generated_at:%Y/%m/%d}"
    )

    # --- Executive summary slide ---
    summary = presentation.slides.add_slide(presentation.slide_layouts[5])
    summary.shapes.title.text = "エグゼクティブサマリー"

    text_frame = summary.shapes.placeholders[1].text_frame
    text_frame.clear()
    text_frame.word_wrap = True

    bullet = text_frame.add_paragraph()
    bullet.text = f"フォロワー総数: {_format_number(stats.followerCount)}"
    bullet.font.size = Pt(18)

    bullet = text_frame.add_paragraph()
    bullet.text = f"期間内フォロワー増加: {_format_number(stats.followerGrowth)}"
    bullet.level = 1

    bullet = text_frame.add_paragraph()
    bullet.text = f"いいね総数: {_format_number(stats.likeCount)}"
    bullet.font.size = Pt(18)

    bullet = text_frame.add_paragraph()
    bullet.text = f"期間内いいね増加: {_format_number(stats.likeGrowth)}"
    bullet.level = 1

    bullet = text_frame.add_paragraph()
    bullet.text = f"平均視聴回数/動画: {_format_number(stats.avgViewCount)}"
    bullet.font.size = Pt(18)

    bullet = text_frame.add_paragraph()
    bullet.text = f"期間内視聴回数増加: {_format_number(stats.viewGrowth)}"
    bullet.level = 1

    bullet = text_frame.add_paragraph()
    bullet.text = f"エンゲージメント率: {_format_float(stats.engagementRate, digits=2)}%"
    bullet.font.size = Pt(18)

    if stats.account_type or stats.mainly_video_type:
        bullet = text_frame.add_paragraph()
        items = []
        if stats.account_type:
            items.append(f"アカウントタイプ: {stats.account_type}")
        if stats.mainly_video_type:
            items.append(f"主な動画タイプ: {stats.mainly_video_type}")
        bullet.text = " / ".join(items)
        bullet.font.size = Pt(14)
        bullet.level = 1

    # --- Top videos slide ---
    top_videos = list(_top_videos(videos, limit=5))
    if top_videos:
        slide = presentation.slides.add_slide(presentation.slide_layouts[5])
        slide.shapes.title.text = "視聴回数トップ5"

        left = Inches(0.3)
        top = Inches(1.5)
        width = Inches(9.0)
        height = Inches(4.0)
        table = slide.shapes.add_table(len(top_videos) + 1, 5, left, top, width, height).table

        headers = ["順位", "投稿日時", "タイトル", "Views", "いいね"]
        for idx, header in enumerate(headers):
            cell = table.cell(0, idx)
            cell.text = header
            cell.text_frame.paragraphs[0].font.bold = True
            cell.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER

        for row_idx, video in enumerate(top_videos, start=1):
            table.cell(row_idx, 0).text = str(row_idx)
            created_text = video.createTime
            table.cell(row_idx, 1).text = created_text[:16]
            table.cell(row_idx, 2).text = video.title or "(タイトルなし)"
            table.cell(row_idx, 3).text = _format_number(video.viewCount)
            table.cell(row_idx, 4).text = _format_number(video.likeCount)

            for col_idx in range(5):
                paragraph = table.cell(row_idx, col_idx).text_frame.paragraphs[0]
                paragraph.font.size = Pt(12)
                if col_idx == 2:
                    paragraph.word_wrap = True
                    paragraph.alignment = PP_ALIGN.LEFT
                else:
                    paragraph.alignment = PP_ALIGN.CENTER

    stream = BytesIO()
    presentation.save(stream)
    stream.seek(0)
    return stream
