import type { GroundTruthKpi, ExecutionResult } from "@/types";

/**
 * Extract all numeric/string values from execution results for anti-hallucination validation.
 * Mirrors the Python report_sanitizer.build_ground_truth_set logic.
 */
export function extractGroundTruth(executionResults: ExecutionResult): GroundTruthKpi[] {
  const kpis: GroundTruthKpi[] = [];
  const results = executionResults.results || {};

  for (const [key, value] of Object.entries(results)) {
    if (value == null) continue;

    if (typeof value === "number") {
      kpis.push({
        source_key: key,
        value,
        formatted_value: formatNumber(value),
        value_type: Number.isInteger(value) ? "integer" : "float",
      });
    } else if (typeof value === "string") {
      kpis.push({
        source_key: key,
        value,
        formatted_value: value,
        value_type: "string",
      });
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if (obj.type === "plotly_figure") continue;

      // DataFrame type
      if (obj.type === "dataframe") {
        const rows = (obj.total_rows ?? obj.rows ?? 0) as number;
        if (rows > 0) {
          kpis.push({ source_key: `${key}.total_rows`, value: rows, formatted_value: formatNumber(rows), value_type: "integer" });
        }
        // Extract cell values from head rows
        const headRows = (obj.head ?? []) as Record<string, unknown>[];
        for (const row of headRows) {
          for (const [cellKey, cellVal] of Object.entries(row)) {
            if (typeof cellVal === "number") {
              kpis.push({ source_key: `${key}.${cellKey}`, value: cellVal, formatted_value: formatNumber(cellVal), value_type: "float" });
            }
          }
        }
        continue;
      }

      // Nested dict with scalar values
      for (const [nk, nv] of Object.entries(obj)) {
        if (typeof nv === "number") {
          kpis.push({ source_key: `${key}.${nk}`, value: nv, formatted_value: formatNumber(nv), value_type: Number.isInteger(nv) ? "integer" : "float" });
        }
      }
    } else if (Array.isArray(value)) {
      kpis.push({ source_key: `${key}.length`, value: value.length, formatted_value: String(value.length), value_type: "integer" });
      for (const item of value.slice(0, 10)) {
        if (typeof item === "number") {
          kpis.push({ source_key: key, value: item, formatted_value: formatNumber(item), value_type: "float" });
        }
      }
    }
  }

  // Add derived percentages from related pairs
  const numerics = kpis.filter((k) => typeof k.value === "number" && (k.value as number) > 0);
  for (let i = 0; i < numerics.length; i++) {
    for (let j = i + 1; j < numerics.length; j++) {
      const a = numerics[i], b = numerics[j];
      const prefixA = a.source_key.includes(".") ? a.source_key.split(".")[0] : "";
      const prefixB = b.source_key.includes(".") ? b.source_key.split(".")[0] : "";
      if (prefixA && prefixA === prefixB) {
        const va = a.value as number, vb = b.value as number;
        if (va <= vb && vb > 0) {
          const pct = (va / vb) * 100;
          kpis.push({ source_key: `${a.source_key}/${b.source_key}`, value: pct, formatted_value: `${pct.toFixed(1)}%`, value_type: "percentage" });
        } else if (vb < va && va > 0) {
          const pct = (vb / va) * 100;
          kpis.push({ source_key: `${b.source_key}/${a.source_key}`, value: pct, formatted_value: `${pct.toFixed(1)}%`, value_type: "percentage" });
        }
      }
    }
  }

  return kpis;
}

/**
 * Build a set of valid numeric representations for sanitization.
 */
export function buildGroundTruthSet(kpis: GroundTruthKpi[]): Set<string> {
  const gt = new Set<string>();
  for (const kpi of kpis) {
    gt.add(String(kpi.value));
    gt.add(kpi.formatted_value);
    if (typeof kpi.value === "number") {
      gt.add(kpi.value.toFixed(2));
      gt.add(kpi.value.toLocaleString());
      if (Number.isInteger(kpi.value)) gt.add(String(kpi.value));
      if (kpi.value >= 0 && kpi.value <= 1) {
        const pct = kpi.value * 100;
        gt.add(pct.toFixed(0));
        gt.add(pct.toFixed(1));
      }
    }
  }
  return gt;
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
