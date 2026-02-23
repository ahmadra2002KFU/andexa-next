"""
Dashboard HTML builder for the executor service.

Generates self-contained HTML dashboards with:
- Tab navigation (Overview, Visualizations, Insights, Data & Code)
- KPI cards grid
- Embedded Plotly charts (JSON -> Plotly.newPlot)
- Responsive design
- Export buttons (HTML download, print to PDF)
- Andexa branding
"""

import json
import logging
import html
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

BRAND_PRIMARY = "#1E5F74"
BRAND_ACCENT = "#14B8A6"
BRAND_SECONDARY = "#17A2B8"
BRAND_TEXT = "#333333"


def build_dashboard(
    title: str,
    kpis: List[Dict[str, Any]],
    plots: List[Dict[str, Any]],
    insights: List[str],
    recommendations: List[str],
    analysis: str = "",
    generated_code: str = "",
    execution_output: str = "",
    commentary: str = "",
) -> str:
    """
    Build a self-contained HTML dashboard.

    Args:
        title: Dashboard title.
        kpis: List of KPI dicts with keys: label, value, icon, trend.
        plots: List of plot dicts with keys: name, json (Plotly JSON string).
        insights: List of insight strings.
        recommendations: List of recommendation strings.
        analysis: AI analysis text.
        generated_code: Python code that was executed.
        execution_output: Execution results text.
        commentary: AI commentary text.

    Returns:
        Complete HTML string.
    """
    kpi_html = _build_kpi_cards(kpis)
    plots_html, plots_js = _build_plots(plots)
    insights_html = _build_insights(insights)
    recs_html = _build_recommendations(recommendations)
    code_html = _build_code_tab(generated_code, execution_output)

    safe_title = html.escape(title)
    safe_analysis = html.escape(analysis)
    safe_commentary = html.escape(commentary)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{safe_title} - Andexa Dashboard</title>
<script src="https://cdn.plot.ly/plotly-2.30.1.min.js"></script>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: {BRAND_TEXT}; }}
.header {{ background: linear-gradient(135deg, {BRAND_PRIMARY}, {BRAND_SECONDARY}); color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }}
.header h1 {{ font-size: 20px; font-weight: 600; }}
.header .brand {{ font-size: 13px; opacity: 0.8; }}
.tabs {{ display: flex; background: white; border-bottom: 2px solid #e2e8f0; padding: 0 32px; }}
.tab {{ padding: 14px 24px; cursor: pointer; font-size: 14px; font-weight: 500; color: #64748b; border-bottom: 3px solid transparent; transition: all 0.2s; }}
.tab:hover {{ color: {BRAND_PRIMARY}; }}
.tab.active {{ color: {BRAND_PRIMARY}; border-bottom-color: {BRAND_ACCENT}; }}
.tab-content {{ display: none; padding: 32px; max-width: 1400px; margin: 0 auto; }}
.tab-content.active {{ display: block; }}
.kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 32px; }}
.kpi-card {{ background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-left: 4px solid {BRAND_ACCENT}; }}
.kpi-card .label {{ font-size: 13px; color: #64748b; margin-bottom: 8px; }}
.kpi-card .value {{ font-size: 28px; font-weight: 700; color: {BRAND_PRIMARY}; }}
.kpi-card .trend {{ font-size: 12px; margin-top: 6px; }}
.kpi-card .trend.up {{ color: #22c55e; }}
.kpi-card .trend.down {{ color: #ef4444; }}
.plot-container {{ background: white; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
.plot-container h3 {{ font-size: 16px; margin-bottom: 16px; color: {BRAND_PRIMARY}; }}
.insight-card {{ background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-left: 4px solid {BRAND_ACCENT}; }}
.insight-card p {{ font-size: 14px; line-height: 1.6; }}
.rec-card {{ background: #f0fdf4; border-radius: 12px; padding: 20px; margin-bottom: 16px; border-left: 4px solid #22c55e; }}
.rec-card p {{ font-size: 14px; line-height: 1.6; }}
.section-title {{ font-size: 18px; font-weight: 600; color: {BRAND_PRIMARY}; margin-bottom: 20px; }}
.analysis-box {{ background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
.analysis-box p {{ font-size: 14px; line-height: 1.7; white-space: pre-wrap; }}
pre.code-block {{ background: #1e293b; color: #e2e8f0; border-radius: 8px; padding: 20px; font-size: 13px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }}
.export-btn {{ background: {BRAND_PRIMARY}; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; }}
.export-btn:hover {{ opacity: 0.9; }}
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>{safe_title}</h1>
    <div class="brand">Powered by Andexa</div>
  </div>
  <div>
    <button class="export-btn" onclick="downloadHTML()">Export HTML</button>
    <button class="export-btn" style="margin-left:8px" onclick="window.print()">Print / PDF</button>
  </div>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('overview')">Overview</div>
  <div class="tab" onclick="switchTab('visualizations')">Visualizations</div>
  <div class="tab" onclick="switchTab('insights')">Insights</div>
  <div class="tab" onclick="switchTab('data')">Data & Code</div>
</div>

<div id="tab-overview" class="tab-content active">
  {kpi_html}
  <div class="section-title">Analysis Summary</div>
  <div class="analysis-box"><p>{safe_analysis}</p></div>
  {"<div class='section-title'>Commentary</div><div class='analysis-box'><p>" + safe_commentary + "</p></div>" if commentary else ""}
</div>

<div id="tab-visualizations" class="tab-content">
  {plots_html if plots_html else '<p style="color:#94a3b8">No visualizations available.</p>'}
</div>

<div id="tab-insights" class="tab-content">
  <div class="section-title">Key Insights</div>
  {insights_html if insights_html else '<p style="color:#94a3b8">No insights available.</p>'}
  <div class="section-title" style="margin-top:32px">Recommendations</div>
  {recs_html if recs_html else '<p style="color:#94a3b8">No recommendations available.</p>'}
</div>

<div id="tab-data" class="tab-content">
  {code_html}
</div>

<script>
function switchTab(name) {{
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  const tabs = document.querySelectorAll('.tab');
  const names = ['overview','visualizations','insights','data'];
  tabs[names.indexOf(name)].classList.add('active');
  // Resize plots when switching to visualizations tab
  if (name === 'visualizations') {{
    window.dispatchEvent(new Event('resize'));
  }}
}}
function downloadHTML() {{
  const blob = new Blob([document.documentElement.outerHTML], {{type:'text/html'}});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dashboard.html';
  a.click();
}}
// Render plots
{plots_js}
</script>
</body>
</html>"""


def _build_kpi_cards(kpis: List[Dict[str, Any]]) -> str:
    if not kpis:
        return ""
    cards = []
    for kpi in kpis[:8]:
        label = html.escape(str(kpi.get("label", "Metric")))
        value = html.escape(str(kpi.get("value", "N/A")))
        icon = html.escape(str(kpi.get("icon", "")))
        trend = kpi.get("trend", "")
        trend_class = ""
        trend_html = ""
        if trend:
            safe_trend = html.escape(str(trend))
            if "+" in str(trend) or "up" in str(trend).lower():
                trend_class = "up"
            elif "-" in str(trend) or "down" in str(trend).lower():
                trend_class = "down"
            trend_html = f'<div class="trend {trend_class}">{safe_trend}</div>'
        cards.append(
            f'<div class="kpi-card">'
            f'<div class="label">{icon} {label}</div>'
            f'<div class="value">{value}</div>'
            f'{trend_html}'
            f'</div>'
        )
    return f'<div class="kpi-grid">{"".join(cards)}</div>'


def _build_plots(plots: List[Dict[str, Any]]) -> tuple:
    if not plots:
        return "", ""
    html_parts = []
    js_parts = []
    for i, plot in enumerate(plots):
        div_id = f"plot-{i}"
        name = html.escape(str(plot.get("name", f"Chart {i+1}")))
        html_parts.append(
            f'<div class="plot-container">'
            f'<h3>{name}</h3>'
            f'<div id="{div_id}" style="width:100%;min-height:400px"></div>'
            f'</div>'
        )
        plot_json = plot.get("json")
        if plot_json:
            # The json is already a string from Plotly's to_json()
            js_parts.append(
                f'try {{ var d{i} = JSON.parse(\'{_escape_js_string(plot_json)}\'); '
                f'Plotly.newPlot("{div_id}", d{i}.data, d{i}.layout, {{responsive:true}}); '
                f'}} catch(e) {{ console.error("Plot {i} error:", e); }}'
            )
    return "\n".join(html_parts), "\n".join(js_parts)


def _build_insights(insights: List[str]) -> str:
    if not insights:
        return ""
    return "\n".join(
        f'<div class="insight-card"><p>{html.escape(ins)}</p></div>'
        for ins in insights
    )


def _build_recommendations(recs: List[str]) -> str:
    if not recs:
        return ""
    return "\n".join(
        f'<div class="rec-card"><p>{html.escape(rec)}</p></div>'
        for rec in recs
    )


def _build_code_tab(code: str, output: str) -> str:
    parts = []
    if code:
        parts.append(
            f'<div class="section-title">Generated Code</div>'
            f'<pre class="code-block">{html.escape(code)}</pre>'
        )
    if output:
        parts.append(
            f'<div class="section-title" style="margin-top:24px">Execution Output</div>'
            f'<pre class="code-block" style="background:#0f172a">{html.escape(output[:5000])}</pre>'
        )
    return "\n".join(parts) if parts else '<p style="color:#94a3b8">No code data available.</p>'


def _escape_js_string(s: str) -> str:
    """Escape a string for embedding in a JS single-quoted string."""
    return (
        s.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("</", "<\\/")
    )
