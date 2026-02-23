"""
JCI KPI threshold calculator.

Evaluates actual KPI values against JCI standard thresholds and
returns compliance status with color coding.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).parent / "kpi_config.json"


def _load_config() -> List[Dict[str, Any]]:
    """Load JCI KPI configuration."""
    try:
        with open(_CONFIG_PATH, "r") as f:
            data = json.load(f)
        return data.get("kpis", [])
    except Exception as e:
        logger.error(f"Failed to load JCI config: {e}")
        return []


def calculate_kpi_thresholds(
    kpi_values: Dict[str, float],
    config: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Evaluate KPI values against JCI thresholds.

    Args:
        kpi_values: Mapping of kpi_id -> actual value.
        config: Optional custom config. Defaults to kpi_config.json.

    Returns:
        List of dicts with: id, label, target, actual, unit, status, color, category, jci_standard.
    """
    if config is None:
        config = _load_config()

    results = []
    for kpi_def in config:
        kpi_id = kpi_def["id"]
        actual = kpi_values.get(kpi_id)
        if actual is None:
            continue

        target = kpi_def["target"]
        direction = kpi_def.get("direction", "higher_is_better")

        if direction == "lower_is_better":
            if actual <= target:
                status, color = "Compliant", "#22c55e"
            elif actual <= target * 1.2:
                status, color = "Warning", "#f59e0b"
            else:
                status, color = "Non-Compliant", "#ef4444"
        else:
            if actual >= target:
                status, color = "Compliant", "#22c55e"
            elif actual >= target * 0.8:
                status, color = "Warning", "#f59e0b"
            else:
                status, color = "Non-Compliant", "#ef4444"

        results.append({
            "id": kpi_id,
            "label": kpi_def["label"],
            "target": target,
            "actual": actual,
            "unit": kpi_def.get("unit", ""),
            "status": status,
            "color": color,
            "category": kpi_def.get("category", ""),
            "jci_standard": kpi_def.get("jci_standard", ""),
        })

    return results
