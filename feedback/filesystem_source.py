"""文件系统反馈数据源适配器.

从共享卷 feedback/raw/{YYYY-MM-DD}/{fbk-id}.json 读取反馈文件.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from pipeline.collector import FeedbackSource
from pipeline.models import FeedbackEntry, FeedbackType, Screenshot, Severity


class FileSystemFeedbackSource(FeedbackSource):
    """从共享卷文件系统读取反馈."""

    def __init__(self, raw_dir: str):
        self.raw_dir = Path(raw_dir)
        self._processed_ids: set[str] = set()

    @property
    def source_name(self) -> str:
        return f"filesystem@{self.raw_dir}"

    def fetch(self, since: Optional[datetime] = None) -> list[FeedbackEntry]:
        entries: list[FeedbackEntry] = []
        if not self.raw_dir.exists():
            return entries

        for date_dir in sorted(self.raw_dir.iterdir()):
            if not date_dir.is_dir():
                continue
            for fpath in sorted(date_dir.glob("*.json")):
                fbk_id = fpath.stem
                if fbk_id in self._processed_ids:
                    continue
                try:
                    entry = self._read_feedback_file(fpath)
                    if since and entry.created_at and entry.created_at <= since:
                        continue
                    entries.append(entry)
                    self._processed_ids.add(fbk_id)
                except Exception as exc:
                    print(f"[FileSystemSource] failed to read {fpath}: {exc}")

        return entries

    def health_check(self) -> bool:
        return self.raw_dir.exists()

    def _read_feedback_file(self, fpath: Path) -> FeedbackEntry:
        with open(fpath) as f:
            data = json.load(f)

        content = data.get("content", {})
        text = content.get("text", "")

        # 截图路径 → Screenshot 对象
        screenshots = []
        for s_path in content.get("screenshots", []) or []:
            screenshots.append(Screenshot(url=s_path))

        meta = data.get("meta", {})

        return FeedbackEntry(
            source_id=data["id"],
            title=text[:80] if text else "(无文字)",
            body=text,
            feedback_type=self._infer_type(text, data.get("type", "")),
            severity=self._infer_severity(text),
            screenshots=screenshots,
            app_version=meta.get("version"),
            platform=meta.get("user_agent", "")[:50] if meta.get("user_agent") else None,
            source_meta={
                "page": meta.get("page", ""),
                "source": data.get("source", ""),
                "fingerprint": content.get("fingerprint"),
                "file_path": str(fpath),
            },
            created_at=self._parse_timestamp(meta.get("timestamp")),
        )

    def _infer_type(self, text: str, declared_type: str) -> FeedbackType:
        if declared_type:
            type_map = {
                "bug": FeedbackType.BUG,
                "feature_request": FeedbackType.FEATURE_REQUEST,
                "feedback": FeedbackType.FEEDBACK,
                "question": FeedbackType.QUESTION,
            }
            if declared_type in type_map:
                return type_map[declared_type]
        # 从文本推断
        bug_keywords = ["崩溃", "闪退", "白屏", "报错", "错误", "bug", "无法", "不能", "没反应"]
        feature_keywords = ["希望", "建议", "增加", "添加", "支持", "能不能"]
        if any(kw in text for kw in bug_keywords):
            return FeedbackType.BUG
        if any(kw in text for kw in feature_keywords):
            return FeedbackType.FEATURE_REQUEST
        return FeedbackType.FEEDBACK

    def _infer_severity(self, text: str) -> Severity:
        critical_kw = ["崩溃", "闪退", "数据丢失", "无法登录", "支付失败"]
        high_kw = ["白屏", "卡死", "无响应", "错误", "无法"]
        low_kw = ["建议", "希望", "最好", "优化"]
        if any(kw in text for kw in critical_kw):
            return Severity.CRITICAL
        if any(kw in text for kw in high_kw):
            return Severity.HIGH
        if any(kw in text for kw in low_kw):
            return Severity.LOW
        return Severity.MEDIUM

    def _parse_timestamp(self, value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
