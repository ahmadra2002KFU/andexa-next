"""
Result serialization for the executor service.

Handles DataFrame, Plotly figure, NumPy, NaN/Infinity, and circular reference
serialization into JSON-safe Python dicts.
"""

import json
import math
import base64
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

MAX_DATAFRAME_ROWS = 50
MAX_PLOTLY_SIZE = 2 * 1024 * 1024  # 2MB


def serialize_value(value: Any, _seen: Optional[Set[int]] = None) -> Any:
    """
    Convert any value to a JSON-serializable Python object.

    Handles: DataFrame, Series, Plotly figures, NumPy arrays/scalars,
    NaN, Infinity, circular references.
    """
    import pandas as pd
    import numpy as np

    if _seen is None:
        _seen = set()

    # Circular reference check for containers
    if isinstance(value, (dict, list, set, tuple)):
        obj_id = id(value)
        if obj_id in _seen:
            return "<circular reference>"
        _seen = _seen | {obj_id}

    if value is None or isinstance(value, (str, int, bool)):
        return value

    # NumPy scalars before float/int
    if isinstance(value, (np.floating, np.integer, np.bool_)):
        return serialize_value(value.item(), _seen)
    if isinstance(value, np.generic):
        return serialize_value(value.item(), _seen)

    if isinstance(value, float):
        if math.isnan(value):
            return None
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        return value

    if isinstance(value, (list, tuple)):
        return [serialize_value(item, _seen) for item in value]

    if isinstance(value, set):
        return [serialize_value(item, _seen) for item in value]

    if isinstance(value, dict):
        return {str(k): serialize_value(v, _seen) for k, v in value.items()}

    if isinstance(value, pd.DataFrame):
        return _serialize_dataframe(value)

    if isinstance(value, pd.Series):
        return _serialize_series(value)

    # Plotly figure
    if hasattr(value, "to_json") and hasattr(value, "show"):
        return _serialize_plotly_figure(value)

    # NumPy array
    if hasattr(value, "tolist"):
        converted = value.tolist()
        if isinstance(converted, (list, tuple)):
            return [serialize_value(item, _seen) for item in converted]
        return serialize_value(converted, _seen)

    # pandas NA/NaT
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    # Datetime
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return None

    # Period
    if hasattr(value, "freqstr"):
        return str(value)

    return str(value)


def _serialize_dataframe(df: Any) -> Dict[str, Any]:
    """Serialize DataFrame to dict with truncation."""
    import pandas as pd

    total_rows = len(df)
    display_rows = min(MAX_DATAFRAME_ROWS, total_rows)
    is_truncated = total_rows > MAX_DATAFRAME_ROWS

    records = []
    for _, row in df.head(display_rows).iterrows():
        record = {}
        for col in df.columns:
            record[str(col)] = serialize_value(row[col])
        records.append(record)

    return {
        "type": "dataframe",
        "shape": [df.shape[0], df.shape[1]],
        "columns": [str(c) for c in df.columns],
        "head": records,
        "dtypes": {str(col): str(dtype) for col, dtype in df.dtypes.items()},
        "total_rows": total_rows,
        "displayed_rows": display_rows,
        "truncated": is_truncated,
    }


def _serialize_series(series: Any) -> Dict[str, Any]:
    """Serialize Series to dict."""
    total = len(series)
    display = min(MAX_DATAFRAME_ROWS, total)
    return {
        "type": "series",
        "name": str(series.name) if series.name is not None else None,
        "length": total,
        "dtype": str(series.dtype),
        "data": [serialize_value(v) for v in series.head(display)],
        "truncated": total > MAX_DATAFRAME_ROWS,
    }


def _serialize_plotly_figure(fig: Any) -> Dict[str, Any]:
    """Serialize Plotly figure to dict."""
    try:
        fig_dict = fig.to_plotly_json() if hasattr(fig, "to_plotly_json") else json.loads(fig.to_json())
        typed_arrays = _count_plotly_typed_arrays(fig_dict)
        normalized = _normalize_plotly_payload(fig_dict)
        figure_json = json.dumps(normalized, separators=(",", ":"), ensure_ascii=False)
        json_size = len(figure_json)
        logger.info(
            "[TRACE_EXEC] plotly_serialize typed_arrays=%s json_size_bytes=%s has_bdata=%s",
            typed_arrays,
            json_size,
            "bdata" in figure_json,
        )
        if json_size > MAX_PLOTLY_SIZE:
            size_mb = json_size / (1024 * 1024)
            return {
                "type": "plotly_figure",
                "json": None,
                "error": f"Figure too large ({size_mb:.1f}MB). Max is {MAX_PLOTLY_SIZE // (1024*1024)}MB.",
                "size_bytes": json_size,
                "truncated": True,
            }
        return {
            "type": "plotly_figure",
            "json": figure_json,
            "size_bytes": json_size,
        }
    except Exception as e:
        logger.error(f"Plotly serialization failed: {e}")
        return {"type": "plotly_figure", "json": None, "error": str(e)}


def _count_plotly_typed_arrays(value: Any) -> int:
    """Count Plotly compact typed-array payloads: {'dtype': ..., 'bdata': ...}."""
    if isinstance(value, dict):
        hit = 1 if isinstance(value.get("dtype"), str) and isinstance(value.get("bdata"), str) else 0
        return hit + sum(_count_plotly_typed_arrays(v) for v in value.values())
    if isinstance(value, list):
        return sum(_count_plotly_typed_arrays(v) for v in value)
    if isinstance(value, tuple):
        return sum(_count_plotly_typed_arrays(v) for v in value)
    return 0


def _normalize_plotly_payload(value: Any) -> Any:
    """
    Normalize Plotly payload values so JS renderers can consume them directly.

    Plotly Python may emit numeric arrays in compact objects like:
    {"dtype": "f8", "bdata": "..."}.
    The web renderer used by the app expects plain JSON arrays.
    """
    import numpy as np

    if isinstance(value, dict):
        maybe_dtype = value.get("dtype")
        maybe_bdata = value.get("bdata")
        if isinstance(maybe_dtype, str) and isinstance(maybe_bdata, str):
            try:
                raw = base64.b64decode(maybe_bdata)
                arr = np.frombuffer(raw, dtype=np.dtype(maybe_dtype))
                shape = value.get("shape")
                if isinstance(shape, list) and shape:
                    try:
                        arr = arr.reshape(tuple(int(x) for x in shape))
                    except Exception:
                        pass
                return [serialize_value(item) for item in arr.tolist()]
            except Exception:
                # Fall through to recursive dict normalization.
                pass
        return {str(k): _normalize_plotly_payload(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize_plotly_payload(v) for v in value]
    if isinstance(value, tuple):
        return [_normalize_plotly_payload(v) for v in value]
    return serialize_value(value)
