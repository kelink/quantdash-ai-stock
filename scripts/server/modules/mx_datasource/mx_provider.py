"""mx-skills 数据查询提供器 — subprocess 调用 mx-skills 脚本并解析输出。"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import pandas as pd

from server.modules.mx_datasource.mx_policy import MX_SKILLS_DIR
from server.shared.runtime import ROOT_DIR

QUERY_TIMEOUT_SECONDS = int(os.environ.get("MX_QUERY_TIMEOUT_SECONDS", "120"))

SKILL_SCRIPT_MAP: dict[str, dict[str, Any]] = {
    "finance": {
        "slug": "mx-finance-data",
        "script": "get_data.py",
        "file_pattern": r"文件:\s*(.+)",
        "parser": "xlsx",
    },
    "screener": {
        "slug": "mx-stocks-screener",
        "script": "get_data.py",
        "file_pattern": r"CSV:\s*(.+)",
        "parser": "csv",
    },
    "macro": {
        "slug": "mx-macro-data",
        "script": "get_data.py",
        "file_pattern": r"文件:\s*(.+)",
        "parser": "xlsx",
    },
    "search": {
        "slug": "mx-finance-search",
        "script": "get_data.py",
        "file_pattern": r"文件:\s*(.+)",
        "parser": "txt",
    },
}


def _build_script_args(skill_type: str, query: str, indicators: str = "") -> list[str]:
    config = SKILL_SCRIPT_MAP[skill_type]
    script_path = MX_SKILLS_DIR / config["slug"] / "scripts" / config["script"]
    if not script_path.exists():
        raise FileNotFoundError(f"mx-skill 脚本不存在: {script_path}")

    args = ["python3", str(script_path), "--query", query]
    if indicators:
        args.extend(["--indicators", indicators])

    if skill_type == "screener":
        args.extend(["--select-type", "all"])

    return args


def _parse_output_path(stdout: str, pattern: str) -> str | None:
    match = re.search(pattern, stdout)
    if match:
        return match.group(1).strip()
    return None


def _read_xlsx_to_rows(file_path: str) -> list[dict[str, Any]]:
    """读取 .xlsx 文件，返回所有 sheet 的行列表。"""
    xlsx = pd.ExcelFile(file_path)
    sheets: dict[str, list[dict[str, Any]]] = {}
    for sheet_name in xlsx.sheet_names:
        df = pd.read_excel(xlsx, sheet_name=sheet_name)
        df = df.where(pd.notna(df), None)
        sheets[sheet_name] = df.to_dict(orient="records")
    return [
        {"sheet": name, "rows": rows}
        for name, rows in sheets.items()
    ]


def _read_csv_to_rows(file_path: str) -> list[dict[str, Any]]:
    """读取 .csv 文件，返回行列表。"""
    df = pd.read_csv(file_path)
    df = df.where(pd.notna(df), None)
    return df.to_dict(orient="records")


def _read_txt_content(file_path: str) -> str:
    """读取 .txt/.md 文件全文。"""
    return Path(file_path).read_text(encoding="utf-8")


def query_mx_skill(
    skill_type: str,
    query: str,
    indicators: str = "",
) -> dict[str, Any]:
    """
    通过 subprocess 调用 mx-skill 脚本查询数据。

    Args:
        skill_type: 查询类型 (finance, screener, macro, search)
        query: 自然语言查询问句
        indicators: 金融指标描述

    Returns:
        {
            "skillType": str,
            "query": str,
            "rows": list[dict],
            "rowCount": int,
            "source": "mx_provider",
        }
    """
    if skill_type not in SKILL_SCRIPT_MAP:
        raise ValueError(f"不支持的查询类型: {skill_type}，可选: {list(SKILL_SCRIPT_MAP.keys())}")

    config = SKILL_SCRIPT_MAP[skill_type]
    args = _build_script_args(skill_type, query, indicators)

    env = {**os.environ}
    if "EM_API_KEY" not in env or not env["EM_API_KEY"].strip():
        env["EM_API_KEY"] = "em_S5Ffen9gkfzo42vG2kiUBLE0UXiYyp4Y"

    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=QUERY_TIMEOUT_SECONDS,
        cwd=str(ROOT_DIR),
        env=env,
    )

    if result.returncode != 0:
        stderr = result.stderr.strip() or "未知错误"
        raise RuntimeError(f"mx-skill 查询失败 (returncode={result.returncode}): {stderr}")

    stdout = result.stdout
    output_path = _parse_output_path(stdout, config["file_pattern"])

    if not output_path:
        raise RuntimeError(f"无法从 mx-skill 输出中定位结果文件。stdout: {stdout[:500]}")

    output_path = output_path.strip()
    if not Path(output_path).is_absolute():
        output_path = str(ROOT_DIR / output_path)

    if not Path(output_path).exists():
        raise FileNotFoundError(f"mx-skill 输出文件不存在: {output_path}")

    parser = config["parser"]
    if parser == "xlsx":
        rows: Any = _read_xlsx_to_rows(output_path)
    elif parser == "csv":
        rows = _read_csv_to_rows(output_path)
    elif parser == "txt":
        rows = [{"content": _read_txt_content(output_path)}]
    else:
        rows = []

    row_count = sum(
        len(sheet["rows"]) if isinstance(sheet, dict) and "rows" in sheet else 0
        for sheet in (rows if isinstance(rows, list) else [])
    ) if isinstance(rows, list) else len(rows) if isinstance(rows, list) else 0

    return {
        "skillType": skill_type,
        "query": query,
        "rows": rows,
        "rowCount": row_count,
        "source": "mx_provider",
        "outputPath": output_path,
    }


__all__ = [
    "query_mx_skill",
    "SKILL_SCRIPT_MAP",
]
