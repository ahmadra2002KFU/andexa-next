"""
Andexa Executor Service — FastAPI application.

Endpoints:
  POST /execute                — Execute sandboxed Python code
  POST /execute-custom         — Execute with custom variable injection
  POST /inspect-column         — Inspect a column (dtype, sample, stats)
  POST /extract-kpis           — Extract KPI values from DataFrame
  POST /generate-report-assets — Convert Plotly figures to PNG (base64)
  POST /generate-dashboard     — Generate self-contained HTML dashboard
  POST /upload                 — Upload a CSV/XLSX file
  GET  /health                 — Health check with library versions
"""

import base64
import json
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from executor import execute, load_dataframe
from serializer import serialize_value
from dashboard_builder import build_dashboard

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Andexa Executor Service", version="1.0.0")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ExecuteRequest(BaseModel):
    code: str
    file_paths: List[str] = Field(default_factory=list)
    timeout: int = 30


class ExecuteCustomRequest(BaseModel):
    code: str
    file_paths: List[str] = Field(default_factory=list)
    variables: Dict[str, Any] = Field(default_factory=dict)
    timeout: int = 30


class KpiExpression(BaseModel):
    label: str
    extract: str  # Python expression to evaluate


class ExtractKpisRequest(BaseModel):
    file_paths: List[str]
    expressions: List[KpiExpression]


class KpiResult(BaseModel):
    label: str
    value: Any = None
    success: bool
    error: Optional[str] = None


class ExtractKpisResponse(BaseModel):
    kpis: List[KpiResult]


class PlotInput(BaseModel):
    json_str: str = Field(..., alias="json")


class GenerateReportAssetsRequest(BaseModel):
    plots: List[Dict[str, Any]]
    dpi: int = 150


class ImageResult(BaseModel):
    base64: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    error: Optional[str] = None


class GenerateReportAssetsResponse(BaseModel):
    images: List[ImageResult]


class ExecuteResponse(BaseModel):
    """Response shaped to match the Next.js ExecutionResult interface."""
    success: bool
    output: str = ""
    results: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    execution_time_ms: int = 0


class InspectColumnRequest(BaseModel):
    file_path: str
    column_name: str
    sample_size: int = 10


class InspectColumnResponse(BaseModel):
    column_name: str
    dtype: str
    non_null_count: int
    null_count: int
    unique_count: int
    sample_values: List[Any]
    stats: Optional[Dict[str, Any]] = None


class UploadResponse(BaseModel):
    filename: str
    rows: int
    columns: int
    column_metadata: Dict[str, Any]
    stored_path: str


class HealthResponse(BaseModel):
    status: str
    libraries: Dict[str, str]


class DashboardRequest(BaseModel):
    title: str = "Dashboard"
    kpis: List[Dict[str, Any]] = Field(default_factory=list)
    plots: List[Dict[str, Any]] = Field(default_factory=list)
    insights: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    analysis: str = ""
    generated_code: str = ""
    execution_output: str = ""
    commentary: str = ""


class DashboardResponse(BaseModel):
    html: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _reshape_execute_result(raw: Dict[str, Any]) -> ExecuteResponse:
    """Reshape the raw executor result to match the Next.js ExecutionResult interface."""
    results: Dict[str, Any] = {}
    if raw.get("result") is not None:
        results["result"] = raw["result"]
    for i, plot in enumerate(raw.get("plots", [])):
        results[f"plot_{i}"] = {"type": "plotly_figure", **plot}
    return ExecuteResponse(
        success=raw.get("success", False),
        output=raw.get("output", ""),
        results=results,
        error=raw.get("error"),
        execution_time_ms=raw.get("execution_time_ms", 0),
    )


@app.post("/execute", response_model=ExecuteResponse)
async def execute_code(req: ExecuteRequest):
    """Execute sandboxed Python code against uploaded data files."""
    raw = execute(
        code=req.code,
        file_paths=req.file_paths if req.file_paths else None,
        timeout=req.timeout,
    )
    return _reshape_execute_result(raw)


@app.post("/execute-custom", response_model=ExecuteResponse)
async def execute_custom(req: ExecuteCustomRequest):
    """Execute code with custom variable injection."""
    raw = execute(
        code=req.code,
        file_paths=req.file_paths if req.file_paths else None,
        variables=req.variables if req.variables else None,
        timeout=req.timeout,
    )
    return _reshape_execute_result(raw)


@app.post("/extract-kpis", response_model=ExtractKpisResponse)
async def extract_kpis(req: ExtractKpisRequest):
    """Extract KPI values by evaluating expressions against loaded DataFrames."""
    import pandas as pd

    # Load the first file as df
    if not req.file_paths:
        raise HTTPException(status_code=400, detail="At least one file_path is required")

    try:
        df = load_dataframe(req.file_paths[0])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_paths[0]}")

    kpis: List[KpiResult] = []
    for expr in req.expressions:
        try:
            # Evaluate expression in a restricted namespace
            ns = {"df": df, "pd": pd, "len": len, "sum": sum, "min": min, "max": max, "round": round, "abs": abs}
            value = eval(expr.extract, {"__builtins__": {}}, ns)
            kpis.append(KpiResult(
                label=expr.label,
                value=serialize_value(value),
                success=True,
            ))
        except Exception as e:
            kpis.append(KpiResult(
                label=expr.label,
                success=False,
                error=str(e),
            ))

    return ExtractKpisResponse(kpis=kpis)


@app.post("/generate-report-assets", response_model=GenerateReportAssetsResponse)
async def generate_report_assets(req: GenerateReportAssetsRequest):
    """Convert Plotly figures to PNG images (base64 encoded)."""
    try:
        import plotly.graph_objects as go
        import plotly.io as pio
    except ImportError:
        raise HTTPException(status_code=500, detail="plotly not available")

    try:
        import kaleido  # noqa: F401
    except ImportError:
        raise HTTPException(status_code=500, detail="kaleido not installed — required for PNG export")

    images: List[ImageResult] = []
    for plot_data in req.plots:
        try:
            json_str = plot_data.get("json")
            if not json_str:
                images.append(ImageResult(error="No JSON data"))
                continue

            fig_dict = json.loads(json_str) if isinstance(json_str, str) else json_str
            fig = go.Figure(fig_dict)

            scale = req.dpi / 72  # base DPI is 72
            img_bytes = pio.to_image(fig, format="png", width=1200, height=800, scale=scale)

            images.append(ImageResult(
                base64=base64.b64encode(img_bytes).decode("ascii"),
                width=1200,
                height=800,
            ))
        except Exception as e:
            logger.error(f"PNG conversion failed: {e}")
            images.append(ImageResult(error=str(e)))

    return GenerateReportAssetsResponse(images=images)


@app.post("/generate-dashboard", response_model=DashboardResponse)
async def generate_dashboard(req: DashboardRequest):
    """Generate a self-contained HTML dashboard."""
    html_content = build_dashboard(
        title=req.title,
        kpis=req.kpis,
        plots=req.plots,
        insights=req.insights,
        recommendations=req.recommendations,
        analysis=req.analysis,
        generated_code=req.generated_code,
        execution_output=req.execution_output,
        commentary=req.commentary,
    )
    return DashboardResponse(html=html_content)


UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/inspect-column", response_model=InspectColumnResponse)
async def inspect_column(req: InspectColumnRequest):
    """Inspect a column — dtype, sample values, basic stats."""
    try:
        df = load_dataframe(req.file_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    if req.column_name not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{req.column_name}' not found. Available: {list(df.columns)}")

    col = df[req.column_name]
    sample = col.dropna().head(req.sample_size).tolist()

    stats: Optional[Dict[str, Any]] = None
    if pd.api.types.is_numeric_dtype(col):
        stats = {
            "min": serialize_value(col.min()),
            "max": serialize_value(col.max()),
            "mean": serialize_value(col.mean()),
            "median": serialize_value(col.median()),
            "std": serialize_value(col.std()),
        }

    return InspectColumnResponse(
        column_name=req.column_name,
        dtype=str(col.dtype),
        non_null_count=int(col.notna().sum()),
        null_count=int(col.isna().sum()),
        unique_count=int(col.nunique()),
        sample_values=[serialize_value(v) for v in sample],
        stats=stats,
    )


@app.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Form(""),
):
    """Upload a CSV/XLSX file and return metadata."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("csv", "xlsx", "xls"):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported")

    # Save to uploads directory with unique name
    stored_name = f"{uuid.uuid4().hex}_{file.filename}"
    stored_path = UPLOAD_DIR / stored_name
    with open(stored_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Load and extract metadata
    try:
        df = load_dataframe(str(stored_path))
    except Exception as e:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    # Build column metadata
    column_metadata: Dict[str, Any] = {
        "basic_info": {
            "filename": file.filename,
            "shape": {"rows": len(df), "columns": len(df.columns)},
            "column_names": list(df.columns),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        },
        "columns": {},
    }

    for col_name in df.columns:
        col = df[col_name]
        col_info: Dict[str, Any] = {
            "dtype": str(col.dtype),
            "null_count": int(col.isna().sum()),
            "null_percentage": round(float(col.isna().mean()) * 100, 2),
            "unique_count": int(col.nunique()),
            "non_null_count": int(col.notna().sum()),
        }
        if pd.api.types.is_numeric_dtype(col):
            col_info["column_type"] = "numeric"
            col_info["min"] = serialize_value(col.min())
            col_info["max"] = serialize_value(col.max())
            col_info["mean"] = serialize_value(col.mean())
        else:
            col_info["column_type"] = "categorical"
            top = col.value_counts().head(5)
            col_info["top_values"] = [{"value": str(v), "count": int(c)} for v, c in top.items()]
        column_metadata["columns"][col_name] = col_info

    return UploadResponse(
        filename=stored_name,
        rows=len(df),
        columns=len(df.columns),
        column_metadata=column_metadata,
        stored_path=str(stored_path),
    )


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check with library versions."""
    libs = {}
    for name in ("pandas", "numpy", "plotly", "scipy", "sklearn", "statsmodels", "duckdb", "seaborn", "matplotlib", "kaleido"):
        try:
            mod = __import__(name)
            libs[name] = getattr(mod, "__version__", "installed")
        except ImportError:
            libs[name] = "not installed"
    return HealthResponse(status="healthy", libraries=libs)
