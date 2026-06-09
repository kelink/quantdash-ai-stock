"""mx-skills 数据源健康检查与可用性探测。"""

from __future__ import annotations

import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from server.shared.runtime import ROOT_DIR

MX_SKILLS_DIR = ROOT_DIR / "mxDataSource" / "mx-skills"
MX_DATASETS_METADATA: dict[str, dict[str, Any]] = {
    "stock_quote": {
        "actions": ["stock_quote"],
        "label": "全市场实时行情",
        "skillSlug": "mx-finance-data",
    },
    "financials": {
        "actions": ["financials"],
        "label": "财务报表与估值",
        "skillSlug": "mx-finance-data",
    },
    "macro_indicators": {
        "actions": ["macro_indicators"],
        "label": "宏观指标",
        "skillSlug": "mx-macro-data",
    },
    "stock_screener": {
        "actions": ["stock_screener"],
        "label": "条件选股",
        "skillSlug": "mx-stocks-screener",
    },
    "news_search": {
        "actions": ["news_search"],
        "label": "资讯搜索",
        "skillSlug": "mx-finance-search",
    },
}


def _check_python3() -> bool:
    """检查 python3 是否可用。"""
    try:
        result = subprocess.run(
            ["python3", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ},
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False


def _check_mx_skills_dir() -> bool:
    """检查 mx-skills 目录是否存在且包含至少一个 skill。"""
    if not MX_SKILLS_DIR.exists() or not MX_SKILLS_DIR.is_dir():
        return False
    for item in MX_SKILLS_DIR.iterdir():
        if item.is_dir() and (item / "SKILL.md").exists():
            return True
    return False


def _get_installed_skills() -> list[str]:
    """列出 mx-skills 目录下已安装的 skill slug。"""
    if not MX_SKILLS_DIR.exists():
        return []
    skills: list[str] = []
    for item in sorted(MX_SKILLS_DIR.iterdir()):
        if item.is_dir() and (item / "SKILL.md").exists():
            skills.append(item.name)
    return skills


def _check_em_api_key() -> bool:
    """检查 EM_API_KEY 环境变量是否已配置。"""
    return bool(os.environ.get("EM_API_KEY", "").strip())


def is_mx_available() -> bool:
    """mx-skills 数据源是否可用于查询。"""
    return _check_python3() and _check_mx_skills_dir() and _check_em_api_key()


def get_mx_health() -> dict[str, Any]:
    """返回 mx 数据源基础健康状态（不含探测）。"""
    now = datetime.now(timezone.utc).isoformat()
    available = is_mx_available()
    return {
        "available": available,
        "installedSkills": _get_installed_skills(),
        "lastCheckedAt": now,
        "lastSuccessAt": None,
        "lastError": None if available else _build_unavailable_reason(),
        "lastLatencyMs": None,
        "probeResults": {},
    }


def _build_unavailable_reason() -> str:
    parts: list[str] = []
    if not _check_python3():
        parts.append("python3 不可用")
    if not _check_mx_skills_dir():
        parts.append("mx-skills 目录未找到")
    if not _check_em_api_key():
        parts.append("EM_API_KEY 环境变量未配置")
    return "; ".join(parts) if parts else "未知原因"


def probe_mx_skills() -> dict[str, Any]:
    """执行轻量探测，对每个已安装的 skill 做 smoke test。"""
    health = get_mx_health()
    installed = _get_installed_skills()
    probe_results: dict[str, dict[str, Any]] = {}
    success_count = 0

    for slug in installed:
        skill_dir = MX_SKILLS_DIR / slug
        script_path = skill_dir / "scripts" / "get_data.py"
        if not script_path.exists():
            probe_results[slug] = {
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "detail": "脚本文件不存在",
                "latencyMs": None,
                "ok": False,
                "skillSlug": slug,
            }
            continue

        started = datetime.now(timezone.utc)
        try:
            result = subprocess.run(
                ["python3", str(script_path), "--help"],
                capture_output=True,
                text=True,
                timeout=15,
                cwd=str(ROOT_DIR),
                env={**os.environ},
            )
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            ok = result.returncode == 0 and (result.stdout or result.stderr)
            probe_results[slug] = {
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "detail": "脚本可达" if ok else f"脚本返回码: {result.returncode}",
                "latencyMs": elapsed_ms,
                "ok": ok,
                "skillSlug": slug,
            }
            if ok:
                success_count += 1
        except (subprocess.TimeoutExpired, OSError) as exc:
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            probe_results[slug] = {
                "checkedAt": datetime.now(timezone.utc).isoformat(),
                "detail": str(exc),
                "latencyMs": elapsed_ms,
                "ok": False,
                "skillSlug": slug,
            }

    health["probeResults"] = probe_results
    if success_count > 0:
        health["lastSuccessAt"] = datetime.now(timezone.utc).isoformat()
    return health


def get_mx_dataset_catalog() -> list[dict[str, Any]]:
    """返回 mx 数据源支持的数据集目录。"""
    installed = set(_get_installed_skills())
    return [
        {
            "actions": list(config["actions"]),
            "dataset": dataset,
            "label": config["label"],
            "skillSlug": config["skillSlug"],
        }
        for dataset, config in MX_DATASETS_METADATA.items()
        if config["skillSlug"] in installed
    ]


__all__ = [
    "MX_DATASETS_METADATA",
    "MX_SKILLS_DIR",
    "get_mx_dataset_catalog",
    "get_mx_health",
    "is_mx_available",
    "probe_mx_skills",
]
