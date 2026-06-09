"""mx 数据源全局策略持久化。"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from server.shared.runtime import SYSTEM_DIR

MX_POLICY_PATH = SYSTEM_DIR / "mx_provider_policy.json"
DEFAULT_MX_POLICY: dict[str, Any] = {
    "globalMode": "prefer_eastmoney",
    "updatedAt": None,
}
SUPPORTED_MX_MODES = {"prefer_mx", "prefer_eastmoney", "prefer_secondary"}


def _read_mx_policy() -> dict[str, Any]:
    if not MX_POLICY_PATH.exists():
        return dict(DEFAULT_MX_POLICY)
    try:
        payload = json.loads(MX_POLICY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return dict(DEFAULT_MX_POLICY)
    mode = str(payload.get("globalMode", "")).strip()
    if mode not in SUPPORTED_MX_MODES:
        mode = DEFAULT_MX_POLICY["globalMode"]
    return {
        "globalMode": mode,
        "updatedAt": payload.get("updatedAt"),
    }


def get_mx_policy() -> dict[str, Any]:
    return _read_mx_policy()


def save_mx_policy(global_mode: str) -> dict[str, Any]:
    mode = str(global_mode).strip()
    if mode not in SUPPORTED_MX_MODES:
        mode = DEFAULT_MX_POLICY["globalMode"]
    policy = {
        "globalMode": mode,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    MX_POLICY_PATH.write_text(json.dumps(policy, ensure_ascii=False, indent=2), encoding="utf-8")
    return policy


__all__ = [
    "DEFAULT_MX_POLICY",
    "SUPPORTED_MX_MODES",
    "get_mx_policy",
    "save_mx_policy",
]
