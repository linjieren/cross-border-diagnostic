"""FastAPI 后端反馈数据源适配器.

对接开发线实现的反馈 API (已对齐契约):
- GET /api/feedback?since=xxx&status=xxx&cursor=xxx&limit=200  — 分页拉取
- GET /api/health  — 健康检查
- POST /api/feedback/json  — JSON 格式提交（字段齐全）
"""

from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

import requests

from pipeline.collector import FeedbackSource
from pipeline.models import FeedbackEntry, FeedbackType, Screenshot, Severity


class FastAPIFeedbackSource(FeedbackSource):
    """通过 HTTP API 从 FastAPI 后端拉取反馈."""

    def __init__(self, base_url: str, timeout: int = 10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "PigBun-FeedbackCollector/1.0"})

    @property
    def source_name(self) -> str:
        return f"fastapi@{self.base_url}"

    def fetch(self, since: Optional[datetime] = None) -> list[FeedbackEntry]:
        url = urljoin(self.base_url + "/", "api/feedback")
        params: dict = {"limit": 200}
        if since:
            params["since"] = since.isoformat()

        entries: list[FeedbackEntry] = []
        while url:
            try:
                resp = self._session.get(url, params=params, timeout=self.timeout)
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                print(f"[FastAPISource] request failed: {exc}")
                break

            items = data.get("items", [])
            for item in items:
                entries.append(self._map_to_entry(item))

            # 分页
            next_cursor = data.get("next_cursor")
            if next_cursor:
                params = {"cursor": next_cursor, "limit": 200}
            else:
                url = ""

        return entries

    def health_check(self) -> bool:
        try:
            url = urljoin(self.base_url + "/", "api/health")
            resp = self._session.get(url, timeout=self.timeout)
            return resp.status_code < 500
        except Exception:
            return False

    def _map_to_entry(self, item: dict) -> FeedbackEntry:
        # screenshots 现在是 JSON 数组 [{url, alt_text}, ...]
        screenshots = []
        for s in item.get("screenshots", []) or []:
            if isinstance(s, dict):
                screenshots.append(Screenshot(
                    url=s.get("url", ""),
                    alt_text=s.get("alt_text"),
                ))
            elif isinstance(s, str):
                screenshots.append(Screenshot(url=s))

        # 兼容旧版 screenshot_path 单字段
        if not screenshots and item.get("screenshot_path"):
            screenshot_url = urljoin(
                self.base_url + "/",
                f"api/uploads/{item['screenshot_path'].split('/')[-1]}"
            )
            screenshots.append(Screenshot(url=screenshot_url))

        title = item.get("title") or item.get("content", "")[:80]
        body = item.get("body") or item.get("content", "")

        return FeedbackEntry(
            source_id=str(item.get("id", "")),
            title=title,
            body=body,
            feedback_type=self._infer_type(item),
            severity=self._infer_severity(item),
            screenshots=screenshots,
            user_id=item.get("user_id"),
            app_version=item.get("app_version"),
            platform=item.get("platform"),
            device_info=item.get("device_info") or item.get("user_agent"),
            source_meta={
                "page_url": item.get("page_url", ""),
                "raw": item,
            },
            created_at=self._parse_datetime(item.get("created_at")),
        )

    def _infer_type(self, item: dict) -> FeedbackType:
        raw_type = item.get("type", "")
        type_map = {
            "bug": FeedbackType.BUG,
            "feature_request": FeedbackType.FEATURE_REQUEST,
            "feedback": FeedbackType.FEEDBACK,
            "question": FeedbackType.QUESTION,
        }
        return type_map.get(raw_type, FeedbackType.FEEDBACK)

    def _infer_severity(self, item: dict) -> Severity:
        raw = item.get("severity", "")
        severity_map = {
            "critical": Severity.CRITICAL,
            "high": Severity.HIGH,
            "medium": Severity.MEDIUM,
            "low": Severity.LOW,
        }
        return severity_map.get(raw, Severity.MEDIUM)

    def _parse_datetime(self, value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
