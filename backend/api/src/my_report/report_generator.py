from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Iterable, Optional, Sequence

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
from pptx.shapes.shapetree import SlideShapes

from .models import TikTokStats, TikTokVideo


BRAND_TURQUOISE = RGBColor(102, 230, 215)
BRAND_DARK = RGBColor(20, 55, 63)
ACCENT_PINK = RGBColor(255, 135, 150)
ACCENT_SOFT = RGBColor(220, 250, 244)
NEUTRAL_BG = RGBColor(245, 252, 250)
CARD_BORDER = RGBColor(180, 230, 220)
FONT_FAMILY = "Noto Sans JP"
SLIDE_MARGIN = Inches(0.5)


def _find_placeholder(shapes: SlideShapes, idx: int):
    for placeholder in shapes.placeholders:
        if placeholder.placeholder_format.idx == idx:
            return placeholder
    return None


def _set_background(slide, color: RGBColor) -> None:
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _ensure_text_frame(
    shapes: SlideShapes,
    placeholder_idx: Optional[int],
    *,
    left: float,
    top: float,
    width: float,
    height: float,
):
    placeholder = _find_placeholder(shapes, placeholder_idx) if placeholder_idx is not None else None
    if placeholder is not None:
        text_frame = placeholder.text_frame
        text_frame.clear()
        text_frame.word_wrap = True
        return text_frame

    textbox = shapes.add_textbox(left, top, width, height)
    text_frame = textbox.text_frame
    text_frame.clear()
    text_frame.word_wrap = True
    return text_frame


def _configure_paragraph(paragraph, *, size: Pt, color: RGBColor, bold: bool = False, align=PP_ALIGN.LEFT):
    paragraph.font.size = size
    paragraph.font.bold = bold
    paragraph.font.name = FONT_FAMILY
    paragraph.font.color.rgb = color
    paragraph.alignment = align


def _set_slide_title(slide, text: str, *, color: RGBColor = BRAND_DARK) -> None:
    title_shape = slide.shapes.title if slide.shapes.title else _find_placeholder(slide.shapes, 0)
    if title_shape is None:
        title_shape = slide.shapes.add_textbox(SLIDE_MARGIN, SLIDE_MARGIN, Inches(9.0), Inches(1.0))
    text_frame = title_shape.text_frame
    text_frame.clear()
    paragraph = text_frame.paragraphs[0]
    paragraph.text = text
    _configure_paragraph(paragraph, size=Pt(34), color=color, bold=True, align=PP_ALIGN.LEFT)


def _draw_brand_header(presentation: Presentation, slide, text: str, subtitle: Optional[str] = None) -> None:
    width = presentation.slide_width
    header_height = Inches(1.4)
    header = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, width, header_height)
    header.fill.solid()
    header.fill.fore_color.rgb = BRAND_TURQUOISE
    header.line.width = Pt(0)

    tf = header.text_frame
    tf.clear()
    title_p = tf.paragraphs[0]
    title_p.text = text
    _configure_paragraph(title_p, size=Pt(30), color=BRAND_DARK, bold=True)
    if subtitle:
        subtitle_p = tf.add_paragraph()
        subtitle_p.text = subtitle
        _configure_paragraph(subtitle_p, size=Pt(14), color=BRAND_DARK)


def _add_kpi_card(slide, *, left: float, top: float, width: float, height: float, title: str, value: str, footnote: Optional[str] = None) -> None:
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = RGBColor(255, 255, 255)
    card.line.color.rgb = CARD_BORDER
    card.line.width = Pt(1)
    card.shadow.inherit = False

    tf = card.text_frame
    tf.clear()

    title_p = tf.paragraphs[0]
    title_p.text = title
    _configure_paragraph(title_p, size=Pt(13), color=BRAND_DARK)

    value_p = tf.add_paragraph()
    value_p.text = value
    _configure_paragraph(value_p, size=Pt(28), color=BRAND_DARK, bold=True)

    if footnote:
        foot = tf.add_paragraph()
        foot.text = footnote
        _configure_paragraph(foot, size=Pt(12), color=ACCENT_PINK)


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


def _create_cover_slide(presentation: Presentation, *, account_name: str, period_label: str, start_date: datetime, end_date: datetime, generated_at: datetime) -> None:
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _set_background(slide, BRAND_TURQUOISE)

    width = presentation.slide_width
    height = presentation.slide_height
    accent = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, SLIDE_MARGIN, height - Inches(2.5), width - SLIDE_MARGIN * 2, Inches(1.5))
    accent.fill.solid()
    accent.fill.fore_color.rgb = RGBColor(255, 255, 255)
    accent.line.width = Pt(0)
    accent.shadow.inherit = False

    title_box = slide.shapes.add_textbox(SLIDE_MARGIN, Inches(1.5), width - SLIDE_MARGIN * 2, Inches(2.5))
    tf = title_box.text_frame
    tf.clear()

    main_title = tf.paragraphs[0]
    main_title.text = "TikTok Performance Report"
    _configure_paragraph(main_title, size=Pt(42), color=BRAND_DARK, bold=True)

    subtitle = tf.add_paragraph()
    subtitle.text = f"{account_name}"
    _configure_paragraph(subtitle, size=Pt(24), color=BRAND_DARK)

    details = tf.add_paragraph()
    details.text = (
        f"対象期間: {start_date:%Y/%m/%d} – {end_date:%Y/%m/%d} ({period_label})\n"
        f"作成日: {generated_at:%Y/%m/%d}"
    )
    _configure_paragraph(details, size=Pt(14), color=BRAND_DARK)


def _create_summary_slide(presentation: Presentation, stats: TikTokStats) -> None:
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _set_background(slide, NEUTRAL_BG)
    _draw_brand_header(presentation, slide, "総括サマリー", "月次パフォーマンスのハイライト")

    cards_top = Inches(1.8)
    card_width = Inches(3.0)
    card_height = Inches(1.6)
    gap = Inches(0.4)
    left_start = SLIDE_MARGIN

    kpis = [
        ("視聴増分", _format_number(stats.viewGrowth), "Views"),
        ("平均視聴/動画", _format_number(stats.avgViewCount), "Avg Views"),
        ("フォロワー総数", _format_number(stats.followerCount), "Followers"),
        ("フォロワー増加", _format_number(stats.followerGrowth), "Net Add"),
    ]

    for idx, (title, value, label) in enumerate(kpis):
        left = left_start + (card_width + gap) * idx
        _add_kpi_card(
            slide,
            left=left,
            top=cards_top,
            width=card_width,
            height=card_height,
            title=title,
            value=value,
            footnote=label,
        )

    narrative_box = slide.shapes.add_textbox(
        SLIDE_MARGIN,
        cards_top + card_height + Inches(0.6),
        presentation.slide_width - SLIDE_MARGIN * 2,
        Inches(2.5),
    )
    tf = narrative_box.text_frame
    tf.clear()
    p = tf.paragraphs[0]
    p.text = "ハイライト"
    _configure_paragraph(p, size=Pt(18), color=BRAND_DARK, bold=True)
    detail = tf.add_paragraph()
    detail.text = "視聴増分とフォロワー動向の概況をここに追加してください（自動コメント機能の拡張予定）。"
    _configure_paragraph(detail, size=Pt(14), color=BRAND_DARK)


def _create_chapter_slide(presentation: Presentation, *, title: str, subtitle: str) -> None:
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _set_background(slide, BRAND_TURQUOISE)

    title_box = slide.shapes.add_textbox(
        SLIDE_MARGIN,
        Inches(2.0),
        presentation.slide_width - SLIDE_MARGIN * 2,
        Inches(2.0),
    )
    tf = title_box.text_frame
    tf.clear()
    main = tf.paragraphs[0]
    main.text = title
    _configure_paragraph(main, size=Pt(40), color=BRAND_DARK, bold=True)
    sub = tf.add_paragraph()
    sub.text = subtitle
    _configure_paragraph(sub, size=Pt(20), color=BRAND_DARK)


def _create_top_videos_slide(presentation: Presentation, videos: Sequence[TikTokVideo]) -> None:
    top_videos = list(_top_videos(videos, limit=6))
    if not top_videos:
        return

    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    _set_background(slide, NEUTRAL_BG)
    _draw_brand_header(presentation, slide, "視聴トップ動画", "再生数上位のコンテンツを確認")

    card_width = Inches(4.2)
    card_height = Inches(1.8)
    gap_x = Inches(0.4)
    gap_y = Inches(0.4)
    start_left = SLIDE_MARGIN
    start_top = Inches(1.8)

    for idx, video in enumerate(top_videos):
        row = idx // 2
        col = idx % 2
        left = start_left + col * (card_width + gap_x)
        top = start_top + row * (card_height + gap_y)
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, card_width, card_height)
        card.fill.solid()
        card.fill.fore_color.rgb = RGBColor(255, 255, 255)
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)
        card.shadow.inherit = False

        tf = card.text_frame
        tf.clear()
        title_p = tf.paragraphs[0]
        title_p.text = f"#{idx + 1} {video.title or '(タイトルなし)'}"
        _configure_paragraph(title_p, size=Pt(13), color=BRAND_DARK, bold=True)

        meta = tf.add_paragraph()
        meta.text = f"投稿日: {video.createTime[:10]} / 視聴数: {_format_number(video.viewCount)}"
        _configure_paragraph(meta, size=Pt(12), color=BRAND_DARK)

        eng = tf.add_paragraph()
        eng.text = f"いいね: {_format_number(video.likeCount)}  コメント: {_format_number(video.commentCount)}  シェア: {_format_number(video.shareCount)}"
        _configure_paragraph(eng, size=Pt(11), color=BRAND_DARK)


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
    generated_at = _ensure_datetime(generated_at)

    presentation = Presentation()

    _create_cover_slide(
        presentation,
        account_name=account_name,
        period_label=period_label,
        start_date=start_date,
        end_date=end_date,
        generated_at=generated_at,
    )

    _create_summary_slide(presentation, stats)
    _create_chapter_slide(presentation, title="Creative Insights", subtitle="投稿内容とリアクションの振り返り")
    _create_top_videos_slide(presentation, videos)

    stream = BytesIO()
    presentation.save(stream)
    stream.seek(0)
    return stream
