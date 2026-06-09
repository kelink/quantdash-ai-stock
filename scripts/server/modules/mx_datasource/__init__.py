"""mx-skills（东方财富妙想）第三数据源模块。"""

from __future__ import annotations

from fastapi import APIRouter

from server.modules.mx_datasource.mx_policy import (
    get_mx_dataset_catalog,
    get_mx_health,
    probe_mx_skills,
)

ROUTER = APIRouter(tags=["mx-datasource"], prefix="/mx-datasource")


@ROUTER.get("/health")
async def mx_health():
    """返回 mx 数据源健康状态。"""
    from server.shared.runtime import run_blocking

    return await run_blocking(get_mx_health)


@ROUTER.get("/datasets")
async def mx_datasets():
    """返回 mx 数据源支持的数据集清单。"""
    return {"datasets": get_mx_dataset_catalog()}


@ROUTER.post("/probe")
async def mx_probe():
    """执行 mx 数据源主动探测。"""
    from server.shared.runtime import run_blocking

    return await run_blocking(probe_mx_skills)


__all__ = [
    "ROUTER",
    "mx_datasets",
    "mx_health",
    "mx_probe",
]
