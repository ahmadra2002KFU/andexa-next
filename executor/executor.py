"""
Enhanced sandboxed Python code execution for the executor service.

Core logic derived from the original code_executor.py but modernized:
- Broader allowed imports (scipy, sklearn, statsmodels, duckdb, seaborn, matplotlib)
- LRU-cached DataFrame loading
- Configurable timeout via ThreadPoolExecutor
- Suppressed fig.show()
- Extracts result, output, fig, fig1-fig9, figure
"""

import sys
import io
import os
import re
import ast
import time
import logging
import traceback
import concurrent.futures
import threading
import functools
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
import plotly.figure_factory as ff
import plotly.io as pio
from plotly.subplots import make_subplots

from validator import validate_code, validate_columns
from serializer import serialize_value

logger = logging.getLogger(__name__)

# Defaults
DEFAULT_TIMEOUT = int(os.getenv("CODE_EXECUTION_TIMEOUT", "30"))
MAX_WORKERS = int(os.getenv("CODE_EXECUTION_MAX_WORKERS", "4"))
MAX_PLOTLY_JSON_SIZE = int(os.getenv("MAX_PLOTLY_JSON_SIZE", str(2 * 1024 * 1024)))

# Suppress Plotly browser opens
pio.renderers.default = "json"
_original_show = go.Figure.show
go.Figure.show = lambda *a, **kw: None


# ---------------------------------------------------------------------------
# DataFrame cache
# ---------------------------------------------------------------------------

_df_cache: Dict[str, Tuple[float, pd.DataFrame]] = {}
_cache_lock = threading.Lock()
_CACHE_MAX = 10


def load_dataframe(path: str) -> pd.DataFrame:
    """Load a DataFrame from CSV/XLSX with LRU caching by path+mtime."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"File not found: {path}")

    mtime = p.stat().st_mtime
    cache_key = f"{path}:{mtime}"

    with _cache_lock:
        if cache_key in _df_cache:
            return _df_cache[cache_key][1].copy()

    # Load outside lock
    ext = p.suffix.lower()
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(path)
    else:
        df = pd.read_csv(path)

    with _cache_lock:
        # Evict oldest if needed
        if len(_df_cache) >= _CACHE_MAX:
            oldest_key = min(_df_cache, key=lambda k: _df_cache[k][0])
            del _df_cache[oldest_key]
        _df_cache[cache_key] = (time.time(), df)

    return df.copy()


# ---------------------------------------------------------------------------
# Thread pool
# ---------------------------------------------------------------------------

_executor_pool: Optional[concurrent.futures.ThreadPoolExecutor] = None
_pool_lock = threading.Lock()


def _get_pool() -> concurrent.futures.ThreadPoolExecutor:
    global _executor_pool
    if _executor_pool is None:
        with _pool_lock:
            if _executor_pool is None:
                _executor_pool = concurrent.futures.ThreadPoolExecutor(
                    max_workers=MAX_WORKERS, thread_name_prefix="exec_"
                )
    return _executor_pool


# ---------------------------------------------------------------------------
# Allowed imports for the sandbox
# ---------------------------------------------------------------------------

ALLOWED_BASE_PACKAGES = frozenset({
    "pandas", "numpy", "plotly", "matplotlib", "seaborn",
    "scipy", "sklearn", "statsmodels", "duckdb",
})

ALLOWED_MODULES = frozenset({
    "json", "base64", "datetime", "time", "calendar", "math",
    "statistics", "random", "collections", "itertools", "functools",
    "re", "string", "decimal", "fractions", "operator", "copy",
    "csv", "io", "typing", "warnings", "hashlib", "codecs",
    "struct", "binascii", "locale", "_strptime", "_datetime",
})

ALLOWED_BUILTINS = {
    "len", "range", "enumerate", "zip", "map", "filter", "sorted", "sum",
    "min", "max", "abs", "round", "int", "float", "str", "bool", "list",
    "dict", "tuple", "set", "type", "isinstance", "hasattr", "getattr",
    "print", "format", "any", "all", "reversed", "slice",
    "iter", "next", "callable", "repr", "ord", "chr", "hex", "bin", "oct",
    "Exception", "ValueError", "KeyError", "TypeError", "IndexError",
    "AttributeError", "NameError", "ZeroDivisionError", "RuntimeError",
    "StopIteration", "FileNotFoundError", "NotImplementedError",
    "OverflowError", "ArithmeticError", "LookupError",
}


# ---------------------------------------------------------------------------
# Core execution
# ---------------------------------------------------------------------------

def execute(
    code: str,
    file_paths: Optional[List[str]] = None,
    variables: Optional[Dict[str, Any]] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """
    Execute code in a sandboxed environment.

    Args:
        code: Python code string.
        file_paths: Paths to CSV/XLSX files. First becomes `df`, all go into `files` dict.
        variables: Extra variables to inject into the namespace.
        timeout: Execution timeout in seconds.

    Returns:
        Dict with keys: success, result, output, plots, error, error_type, suggestion,
        execution_time_ms, warnings.
    """
    start = time.time()

    # Validate
    vr = validate_code(code)
    if not vr.is_valid:
        return {
            "success": False,
            "result": None,
            "output": "",
            "plots": [],
            "error": "; ".join(vr.errors),
            "error_type": "ValidationError",
            "suggestion": "Fix the code errors and retry.",
            "execution_time_ms": int((time.time() - start) * 1000),
            "warnings": vr.warnings,
        }

    code_to_run = vr.cleaned_code or code
    warnings = list(vr.warnings)

    # Load DataFrames
    dataframes: Dict[str, pd.DataFrame] = {}
    if file_paths:
        for i, fp in enumerate(file_paths):
            try:
                df = load_dataframe(fp)
                # First file is "df", others keyed by sanitized filename
                if i == 0:
                    dataframes["df"] = df
                name = Path(fp).stem.lower().replace(" ", "_").replace("-", "_")
                name = re.sub(r"[^a-z0-9_]", "", name)
                dataframes[name] = df
            except Exception as e:
                return {
                    "success": False,
                    "result": None,
                    "output": "",
                    "plots": [],
                    "error": f"Failed to load {fp}: {e}",
                    "error_type": "FileLoadError",
                    "suggestion": "Check the file path and format.",
                    "execution_time_ms": int((time.time() - start) * 1000),
                    "warnings": warnings,
                }

    # Column validation
    if dataframes:
        col_map = {name: list(df.columns) for name, df in dataframes.items()}
        col_warnings = validate_columns(code_to_run, col_map)
        warnings.extend(col_warnings)

    # Build namespace
    namespace = _build_namespace(dataframes, variables)

    # Execute with timeout
    exec_result: Dict[str, Any] = {
        "success": False,
        "stdout": "",
        "stderr": "",
        "exception": None,
    }

    def _run():
        old_stdout, old_stderr = sys.stdout, sys.stderr
        cap_out, cap_err = io.StringIO(), io.StringIO()
        try:
            sys.stdout, sys.stderr = cap_out, cap_err
            exec(code_to_run, namespace)
            exec_result["success"] = True
        except Exception as e:
            exec_result["exception"] = e
        finally:
            sys.stdout, sys.stderr = old_stdout, old_stderr
            exec_result["stdout"] = cap_out.getvalue()
            exec_result["stderr"] = cap_err.getvalue()

    pool = _get_pool()
    future = pool.submit(_run)
    try:
        future.result(timeout=timeout)
    except concurrent.futures.TimeoutError:
        future.cancel()
        return {
            "success": False,
            "result": None,
            "output": "",
            "plots": [],
            "error": f"Execution timed out after {timeout}s",
            "error_type": "TimeoutError",
            "suggestion": "Simplify the code or increase the timeout.",
            "execution_time_ms": int((time.time() - start) * 1000),
            "warnings": warnings,
        }

    elapsed_ms = int((time.time() - start) * 1000)

    if not exec_result["success"]:
        exc = exec_result["exception"]
        tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
        error_type = type(exc).__name__
        error_msg = str(exc)

        # Build suggestion from column warnings
        suggestion = None
        if error_type == "KeyError" and warnings:
            suggestion = " | ".join(w for w in warnings if "Column" in w)
        if not suggestion:
            suggestion = f"Check the {error_type} and fix accordingly."

        return {
            "success": False,
            "result": None,
            "output": exec_result["stdout"],
            "plots": [],
            "error": f"{error_msg}\n{''.join(tb)}",
            "error_type": error_type,
            "suggestion": suggestion,
            "execution_time_ms": elapsed_ms,
            "warnings": warnings,
            "available_columns": _get_available_columns(dataframes),
            "line_number": _extract_line_number(tb),
        }

    # Extract results
    result_value, plots = _extract_results(namespace)

    output = exec_result["stdout"]
    if exec_result["stderr"]:
        output += f"\nStderr:\n{exec_result['stderr']}"

    return {
        "success": True,
        "result": serialize_value(result_value),
        "output": output,
        "plots": plots,
        "error": None,
        "error_type": None,
        "suggestion": None,
        "execution_time_ms": elapsed_ms,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Namespace building
# ---------------------------------------------------------------------------

def _build_namespace(
    dataframes: Dict[str, pd.DataFrame],
    variables: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build the sandboxed execution namespace."""
    import builtins as _builtins

    safe_builtins = {
        name: getattr(_builtins, name)
        for name in ALLOWED_BUILTINS
        if hasattr(_builtins, name)
    }

    def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
        base = name.split(".")[0]
        if base in ALLOWED_BASE_PACKAGES or name in ALLOWED_MODULES:
            return __import__(name, globals, locals, fromlist, level)
        raise ImportError(f"Import of '{name}' is not allowed in sandbox")

    safe_builtins["__import__"] = safe_import

    ns: Dict[str, Any] = {"__builtins__": safe_builtins}

    # Standard modules
    ns.update({
        "pd": pd, "pandas": pd,
        "np": np, "numpy": np,
        "px": px, "go": go, "ff": ff,
        "make_subplots": make_subplots,
    })

    # DataFrames
    for name, df in dataframes.items():
        ns[name] = df.copy()

    # files dict
    ns["files"] = {name: df.copy() for name, df in dataframes.items()}

    # Custom variables
    if variables:
        ns.update(variables)

    return ns


def _extract_results(namespace: Dict[str, Any]) -> Tuple[Any, List[Dict]]:
    """Extract result value and plotly figures from namespace."""

    def is_fig(obj):
        return hasattr(obj, "to_json") and hasattr(obj, "show")

    # Result value
    result_value = None
    for var in ("result", "output", "summary", "analysis"):
        if var in namespace:
            val = namespace[var]
            if not is_fig(val):
                result_value = val
                break

    # Collect unique Plotly figures
    seen_ids: Set[int] = set()
    plots: List[Dict] = []

    # Check numbered figs first, then generic names
    fig_names = []
    for name in namespace:
        if re.match(r"^(fig|figure|plot|chart)\d+$", name):
            fig_names.append(name)
    for name in ("fig", "figure", "plot", "chart", "result", "output"):
        if name not in fig_names:
            fig_names.append(name)

    for name in fig_names:
        val = namespace.get(name)
        if val is not None and is_fig(val) and id(val) not in seen_ids:
            seen_ids.add(id(val))
            _ensure_margins(val)
            try:
                fig_json = val.to_json()
                if len(fig_json) <= MAX_PLOTLY_JSON_SIZE:
                    plots.append({"name": name, "json": fig_json})
                else:
                    size_mb = len(fig_json) / (1024 * 1024)
                    plots.append({
                        "name": name,
                        "json": None,
                        "error": f"Figure too large ({size_mb:.1f}MB)",
                    })
            except Exception as e:
                plots.append({"name": name, "json": None, "error": str(e)})

    # Also scan namespace for any other figures
    for name, val in namespace.items():
        if is_fig(val) and id(val) not in seen_ids:
            seen_ids.add(id(val))
            _ensure_margins(val)
            try:
                fig_json = val.to_json()
                if len(fig_json) <= MAX_PLOTLY_JSON_SIZE:
                    plots.append({"name": name, "json": fig_json})
            except Exception:
                pass

    return result_value, plots


def _ensure_margins(fig: Any) -> None:
    """Ensure Plotly figure has adequate margins."""
    if not hasattr(fig, "update_layout"):
        return
    try:
        current = {}
        if hasattr(fig, "layout") and hasattr(fig.layout, "margin"):
            m = fig.layout.margin
            if m:
                current = {
                    "l": getattr(m, "l", None),
                    "r": getattr(m, "r", None),
                    "t": getattr(m, "t", None),
                    "b": getattr(m, "b", None),
                }
        fig.update_layout(
            margin={
                "l": max(current.get("l") or 0, 80),
                "r": max(current.get("r") or 0, 80),
                "t": max(current.get("t") or 0, 100),
                "b": max(current.get("b") or 0, 100),
            },
            autosize=True,
        )
    except Exception:
        pass


def _get_available_columns(dataframes: Dict[str, pd.DataFrame]) -> Optional[Dict[str, List[str]]]:
    """Return column names for all loaded DataFrames."""
    if not dataframes:
        return None
    return {name: list(df.columns) for name, df in dataframes.items()}


def _extract_line_number(tb_lines: List[str]) -> Optional[int]:
    """Extract line number from traceback."""
    for line in reversed(tb_lines):
        match = re.search(r"line (\d+)", line)
        if match:
            return int(match.group(1))
    return None
