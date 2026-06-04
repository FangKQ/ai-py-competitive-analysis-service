#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
@Time    : 2025-06-03
@Author  : Competitive Analysis Agent Team
@File    : export/pdf.py
@Desc    : Markdown report to PDF conversion using weasyprint
"""
import logging
import traceback
from io import BytesIO

import markdown

logger = logging.getLogger(__name__)

# CSS template for PDF rendering
PDF_CSS = """
@page {
    size: A4;
    margin: 2.5cm 2cm;
    @bottom-center {
        content: counter(page) " / " counter(pages);
        font-size: 9pt;
        color: #666;
    }
}

body {
    font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #333;
}

h1 {
    font-size: 20pt;
    font-weight: 700;
    color: #1a1a2e;
    border-bottom: 2px solid #4a6fa5;
    padding-bottom: 8px;
    margin-bottom: 20px;
}

h2 {
    font-size: 16pt;
    font-weight: 600;
    color: #2d3748;
    margin-top: 28px;
    margin-bottom: 12px;
    border-left: 4px solid #4a6fa5;
    padding-left: 12px;
}

h3 {
    font-size: 14pt;
    font-weight: 600;
    color: #4a5568;
    margin-top: 20px;
    margin-bottom: 8px;
}

p {
    margin-bottom: 10px;
    text-align: justify;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 10pt;
}

th {
    background-color: #4a6fa5;
    color: white;
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
}

td {
    padding: 8px 12px;
    border-bottom: 1px solid #e2e8f0;
}

tr:nth-child(even) td {
    background-color: #f7fafc;
}

/* Inference marker styling */
.inference-marker {
    background-color: #f0f4f8;
    border-left: 3px solid #718096;
    padding: 8px 12px;
    margin: 12px 0;
    font-style: italic;
}

ul, ol {
    padding-left: 24px;
    margin-bottom: 12px;
}

li {
    margin-bottom: 4px;
}

code {
    background-color: #f1f5f9;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10pt;
}

blockquote {
    border-left: 3px solid #cbd5e0;
    padding-left: 12px;
    color: #4a5568;
    margin: 12px 0;
}

a {
    color: #4a6fa5;
    text-decoration: none;
}

/* Citation references */
sup {
    font-size: 8pt;
    color: #4a6fa5;
}
"""


def render_pdf(markdown_report: str) -> bytes:
    """
    Convert a Markdown report to PDF bytes.

    :param markdown_report: full Markdown text of the report
    :return: PDF file content as bytes
    """
    try:
        from weasyprint import HTML

        # Replace unicode emojis/icons that fonts can't render
        cleaned_report = _strip_emojis(markdown_report)

        # Convert Markdown to HTML
        html_body = markdown.markdown(
            cleaned_report,
            extensions=["tables", "fenced_code", "toc"],
            output_format="html",
        )

        # Wrap in full HTML document with CSS
        full_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <style>{PDF_CSS}</style>
</head>
<body>
{html_body}
</body>
</html>"""

        # Render to PDF
        pdf_buffer = BytesIO()
        HTML(string=full_html).write_pdf(pdf_buffer)
        return pdf_buffer.getvalue()

    except ImportError:
        logger.error("weasyprint is not installed. Install with: pip install weasyprint")
        raise RuntimeError(
            "PDF export unavailable: weasyprint not installed. "
            "Run: pip install weasyprint"
        )
    except Exception as e:
        logger.error(f"PDF rendering failed: {traceback.format_exc()}")
        raise RuntimeError(f"PDF rendering failed: {e}")


def _strip_emojis(text: str) -> str:
    """Replace common emojis/icons with text equivalents for PDF compatibility."""
    replacements = {
        "💡": "[洞察]",
        "⭐": "[推荐]",
        "✅": "[√]",
        "❌": "[×]",
        "⚡": "[快速]",
        "🔬": "[深度]",
        "📊": "[数据]",
        "📈": "[增长]",
        "🎯": "[目标]",
        "🔑": "[关键]",
        "⚠️": "[注意]",
        "🏆": "[领先]",
        "💰": "[资金]",
        "🚀": "[增长]",
    }
    for emoji, replacement in replacements.items():
        text = text.replace(emoji, replacement)
    # Remove any remaining emojis (unicode range)
    import re
    text = re.sub(
        r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
        r'\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0001F900-\U0001F9FF'
        r'\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002600-\U000026FF]+',
        '', text
    )
    return text
