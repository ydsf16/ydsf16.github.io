#!/usr/bin/env python3
"""Import the current account's Zhihu column articles into the Astro notes collection."""

from __future__ import annotations

import html
import json
import mimetypes
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag


ROOT = Path(__file__).resolve().parents[1]
CLI = Path.home() / "Library/Application Support/zhihu-cli/current/zhihu-cli"
TODAY = date.today().isoformat()
API = "https://www.zhihu.com/api/v4/columns/c_1721824679277465600/articles?limit=20&offset={}"


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def column_articles() -> list[dict]:
    articles: list[dict] = []
    offset = 0
    while True:
        payload = fetch_json(API.format(offset))
        articles.extend(payload.get("data", []))
        paging = payload.get("paging", {})
        if paging.get("is_end") or not payload.get("data"):
            break
        offset += 20
    return articles


def article_body(url: str) -> dict:
    completed = None
    output_path = None
    for attempt in range(3):
        with tempfile.NamedTemporaryFile(mode="w+", suffix=".json", delete=False) as output:
            output_path = Path(output.name)
            completed = subprocess.run(
                [str(CLI), "me", "content", "--content-url", url],
                stdout=output,
                stderr=subprocess.PIPE,
                text=True,
            )
        if completed.returncode == 0:
            break
        time.sleep(2)
    assert completed is not None
    if completed.returncode != 0:
        raise RuntimeError(
            f"Zhihu CLI failed for {url}: exit={completed.returncode} {completed.stderr[-500:]}"
        )
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    output_path.unlink(missing_ok=True)
    if payload.get("Code") != 0:
        raise RuntimeError(f"Zhihu CLI failed for {url}: {payload}")
    return payload["Data"]


def slug_for(article: dict) -> str:
    article_id = str(article["id"])
    title = re.sub(r"[^a-z0-9]+", "-", article.get("title", "").lower()).strip("-")
    return f"zhihu-{article_id}{('-' + title[:45]) if title else ''}"


def existing_article_ids() -> set[str]:
    ids: set[str] = set()
    for path in (ROOT / "src/content/notes").glob("*/zh.*"):
        match = re.search(r"zhuanlan\.zhihu\.com/p/(\d+)", path.read_text(errors="ignore"))
        if match:
            ids.add(match.group(1))
    return ids


def download_image(url: str, media_dir: Path, index: int) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read()
        content_type = response.headers.get_content_type()
    extension = mimetypes.guess_extension(content_type) or ".jpg"
    if extension == ".jpe":
        extension = ".jpg"
    target = media_dir / f"image-{index:02d}{extension}"
    target.write_bytes(data)
    return "/media/notes/{}/{}".format(media_dir.name, target.name)


def text_content(node: Tag | NavigableString) -> str:
    return html.unescape(node.get_text("", strip=False) if isinstance(node, Tag) else str(node))


def inline(node: Tag | NavigableString, media_dir: Path, image_counter: list[int]) -> str:
    if isinstance(node, NavigableString):
        return str(node).replace("\u00a0", " ")
    if node.name == "br":
        return "  \n"
    if node.name in {"strong", "b"}:
        return f"**{''.join(inline(c, media_dir, image_counter) for c in node.children).strip()}**"
    if node.name in {"em", "i"}:
        return f"*{''.join(inline(c, media_dir, image_counter) for c in node.children).strip()}*"
    if node.name in {"code", "kbd"}:
        return f"`{text_content(node).strip()}`"
    if node.name == "a":
        label = "".join(inline(c, media_dir, image_counter) for c in node.children).strip() or node.get("href", "")
        href = node.get("href", "")
        if "zhihu.com/zvideo/" in href:
            label = label or "知乎视频"
        return f"[{label}]({href})" if href else label
    if node.name == "img":
        alt = html.unescape(node.get("alt", "")).strip()
        if node.get("eeimg") == "1" or node.get("src", "").startswith("https://www.zhihu.com/equation"):
            if "\\begin{" in alt or "\\matrix{" in alt or "\\eqalign{" in alt or "\\\\" in alt:
                return f"\n$$\n{alt}\n$$\n"
            return f"\\({alt}\\)"
        src = node.get("src") or node.get("data-original")
        if not src:
            return ""
        image_counter[0] += 1
        try:
            local = download_image(src, media_dir, image_counter[0])
            return f"![{alt or '文章配图'}]({local})"
        except Exception as exc:
            print(f"  image skipped: {src} ({exc})", file=sys.stderr)
            return f"![{alt or '文章配图'}]({src})"
    if node.name in {"del", "s"}:
        return f"~~{''.join(inline(c, media_dir, image_counter))}~~"
    return "".join(inline(c, media_dir, image_counter) for c in node.children)


def block(node: Tag, media_dir: Path, image_counter: list[int], level: int = 0) -> str:
    name = node.name
    if name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        heading = min(int(name[1]), 4)
        return f"{'#' * heading} {inline(node, media_dir, image_counter).strip()}\n\n"
    if name == "pre":
        code = node.get_text("", strip=False).strip("\n")
        return f"```\n{code}\n```\n\n"
    if name == "blockquote":
        content = render_children(node, media_dir, image_counter).strip()
        return "\n".join(f"> {line}" if line else ">" for line in content.splitlines()) + "\n\n"
    if name in {"ul", "ol"}:
        lines: list[str] = []
        ordered = name == "ol"
        for index, item in enumerate(node.find_all("li", recursive=False), 1):
            marker = f"{index}." if ordered else "-"
            lines.append(f"{marker} {inline(item, media_dir, image_counter).strip()}")
        return "\n".join(lines) + "\n\n"
    if name == "hr":
        return "---\n\n"
    if name in {"p", "div", "section", "figure"}:
        if node.find("pre") is not None:
            return render_children(node, media_dir, image_counter)
        content = inline(node, media_dir, image_counter).strip()
        return f"{content}\n\n" if content else ""
    return render_children(node, media_dir, image_counter)


def render_children(node: Tag, media_dir: Path, image_counter: list[int]) -> str:
    output: list[str] = []
    for child in node.children:
        if isinstance(child, NavigableString):
            if str(child).strip():
                output.append(str(child).strip() + "\n\n")
        elif isinstance(child, Tag):
            output.append(block(child, media_dir, image_counter))
    return "".join(output)


def markdown_from_html(body: str, media_dir: Path) -> str:
    soup = BeautifulSoup(body, "html.parser")
    image_counter = [0]
    root = soup.body or soup
    markdown = render_children(root, media_dir, image_counter)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    markdown = markdown.replace(r"\[", "").replace(r"\]", "")
    markdown = markdown.replace(r"\cr", r"\\")
    markdown = markdown.replace(r"\begin{array}{*{20}{c}}", r"\begin{array}{c}")
    markdown = markdown.replace(r"\begin{array}{*{20}{l}}", r"\begin{array}{l}")
    markdown = markdown.replace(r"\begin{array}[]{}", r"\begin{array}{c}")
    markdown = markdown.replace(r"\hfill", r"\quad")
    markdown = markdown.replace(r"\rm", r"\mathrm")
    markdown = markdown.replace(r"\bm ", r"\mathbf ").replace(r"\bm}", r"\mathbf}")
    return markdown.strip() + "\n"


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write_note(article: dict, data: dict) -> Path:
    slug = slug_for(article)
    note_dir = ROOT / "src/content/notes" / slug
    note_dir.mkdir(parents=True, exist_ok=True)
    media_dir = ROOT / "public/media/notes" / slug
    media_dir.mkdir(parents=True, exist_ok=True)
    body = markdown_from_html(data.get("Body", ""), media_dir)
    title = data.get("Title") or article.get("title") or slug
    source_url = data.get("Url") or article.get("url")
    frontmatter = f'''---
type: note
title: {yaml_string(title)}
lang: zh
date: {TODAY}
updated: {TODAY}
status: "已发布"
featured: false
priority: 0
tags: [SLAM, VIO, 传感器融合]
categories: [Spatial AI, 技术笔记]
draft: false
source:
  platform: 知乎
  type: article
  url: {source_url}
relatedProducts: []
relatedProjects: [robotics-experiments]
---

'''
    (note_dir / "zh.mdx").write_text(frontmatter + body, encoding="utf-8")
    return note_dir / "zh.mdx"


def main() -> None:
    if not CLI.exists():
        raise SystemExit(f"Missing official Zhihu CLI: {CLI}")
    articles = column_articles()
    existing = existing_article_ids()
    print(f"column articles: {len(articles)}, existing: {len(existing)}")
    for index, article in enumerate(reversed(articles), 1):
        article_id = str(article["id"])
        if article_id in existing:
            print(f"[{index}/{len(articles)}] skip {article_id}: already migrated")
            continue
        print(f"[{index}/{len(articles)}] migrate {article_id}: {article.get('title')}", flush=True)
        data = article_body(article["url"])
        path = write_note(article, data)
        print(f"  -> {path}", flush=True)
        time.sleep(1)


if __name__ == "__main__":
    main()
