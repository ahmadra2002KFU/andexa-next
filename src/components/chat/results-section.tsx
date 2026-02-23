"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FlaskConical, AlertCircle, ChevronDown, ChevronUp, Clock, Table2, Hash, Type } from "lucide-react"
import type { ExecutionResult } from "@/types/chat"
import { cn } from "@/lib/utils"

interface ResultsSectionProps {
  results?: ExecutionResult
  isStreaming?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "N/A"
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return String(val)
    // percentage-like (0-1 with decimals that look like ratios are left as-is)
    if (Number.isInteger(val)) return val.toLocaleString("en-US")
    // Keep up to 2 decimal places for floats
    return val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }
  if (typeof val === "boolean") return val ? "Yes" : "No"
  return String(val)
}

function detectUnit(key: string, val: unknown): string {
  const k = key.toLowerCase()
  if (typeof val === "number") {
    if (k.includes("percent") || k.includes("rate") || k.includes("ratio") || k.endsWith("_%") || k.endsWith("_pct")) return "%"
    if (k.includes("cost") || k.includes("price") || k.includes("revenue") || k.includes("salary") || k.includes("amount") || k.includes("sar")) return "SAR "
  }
  return ""
}

function humanizeKey(key: string): string {
  // Convert snake_case or camelCase to Title Case
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  const isNumber = /^[\d,.-]+$/.test(value.replace(/\s/g, ""))
  return (
    <Card className="border-border/50 bg-muted/30 transition-colors hover:bg-muted/50">
      <CardContent className="p-3">
        <p className="mb-1 truncate text-xs font-medium text-muted-foreground" title={label}>
          {label}
        </p>
        <p className={cn("font-semibold leading-tight", isNumber ? "text-lg" : "text-sm")}>
          {unit === "SAR " && <span className="text-xs font-normal text-muted-foreground">SAR </span>}
          {value}
          {unit === "%" && <span className="text-xs font-normal text-muted-foreground">%</span>}
        </p>
      </CardContent>
    </Card>
  )
}

function ObjectResultGrid({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data)
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 12

  // Separate scalar entries from nested objects
  const scalarEntries: [string, unknown][] = []
  const nestedEntries: [string, Record<string, unknown>][] = []

  for (const [key, val] of entries) {
    if (isPlainObject(val) && Object.keys(val).length > 0) {
      nestedEntries.push([key, val as Record<string, unknown>])
    } else {
      scalarEntries.push([key, val])
    }
  }

  const visibleScalars = expanded ? scalarEntries : scalarEntries.slice(0, LIMIT)
  const hasMore = scalarEntries.length > LIMIT

  return (
    <div className="space-y-3">
      {/* Scalar KPI grid */}
      {visibleScalars.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibleScalars.map(([key, val]) => {
            const unit = detectUnit(key, val)
            return <KpiCard key={key} label={humanizeKey(key)} value={formatValue(val)} unit={unit} />
          })}
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Show less" : `Show all ${scalarEntries.length} items`}
        </button>
      )}

      {/* Nested objects as sub-sections */}
      {nestedEntries.map(([key, nested]) => (
        <div key={key} className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{humanizeKey(key)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(nested).map(([k, v]) => {
              if (isPlainObject(v)) {
                // Deep nesting: render as inline JSON
                return (
                  <Card key={k} className="col-span-full border-border/50 bg-muted/30">
                    <CardContent className="p-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{humanizeKey(k)}</p>
                      <pre className="text-xs text-foreground/80 overflow-x-auto">{JSON.stringify(v, null, 2)}</pre>
                    </CardContent>
                  </Card>
                )
              }
              const unit = detectUnit(k, v)
              return <KpiCard key={k} label={humanizeKey(k)} value={formatValue(v)} unit={unit} />
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function DataFrameTable({ df }: { df: { columns: string[]; data: Record<string, unknown>[]; totalRows: number; truncated: boolean } }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Badge variant="secondary" className="text-[10px]">
          Showing {df.data.length} of {df.totalRows.toLocaleString()} rows
          {df.truncated && " (truncated)"}
        </Badge>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="sticky top-0 bg-muted/70">
              {df.columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-foreground">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {df.data.map((row, i) => (
              <tr key={i} className={cn("border-t border-border/50", i % 2 === 1 && "bg-muted/20")}>
                {df.columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-3 py-1.5 text-foreground/80">
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function ResultsSection({ results, isStreaming }: ResultsSectionProps) {
  if (!results && !isStreaming) return null

  if (isStreaming && !results) {
    return (
      <Card className="mb-3 animate-in fade-in duration-300">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <FlaskConical className="h-4 w-4" />
            Results
          </div>
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!results) return null

  // --- No meaningful content: hide entirely ---
  const hasNoContent = !results.success && !results.error && !results.result && !results.dataframe
  if (hasNoContent) return null

  // --- Error ---
  if (!results.success && results.error) {
    return (
      <Card className="mb-3 animate-in fade-in duration-300 border-destructive/30 bg-destructive/5">
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertCircle className="h-4 w-4" />
            Execution Error
          </div>
          <pre className="whitespace-pre-wrap rounded-md bg-destructive/10 p-3 font-mono text-xs text-destructive">
            {results.error}
          </pre>
        </CardContent>
      </Card>
    )
  }

  // Determine result type
  const hasDataframe = !!results.dataframe
  const resultVal = results.result
  const isObject = isPlainObject(resultVal) && Object.keys(resultVal).length > 0
  const isScalar = resultVal !== undefined && resultVal !== null && !isObject && !Array.isArray(resultVal)
  const isArray = Array.isArray(resultVal)

  // --- DataFrame ---
  if (hasDataframe) {
    return (
      <Card className="mb-3 animate-in fade-in duration-300">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <FlaskConical className="h-4 w-4" />
            Results
          </div>
          <DataFrameTable df={results.dataframe!} />
          <ExecutionTimeBadge time={results.executionTime} />
        </CardContent>
      </Card>
    )
  }

  // --- Object / Dict (the main broken case) ---
  if (isObject) {
    return (
      <Card className="mb-3 animate-in fade-in duration-300">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <FlaskConical className="h-4 w-4" />
            Results
            <Badge variant="secondary" className="text-[10px]">
              {Object.keys(resultVal).length} metrics
            </Badge>
          </div>
          <ObjectResultGrid data={resultVal as Record<string, unknown>} />
          <ExecutionTimeBadge time={results.executionTime} />
        </CardContent>
      </Card>
    )
  }

  // --- Scalar ---
  if (isScalar) {
    const isNum = typeof resultVal === "number"
    return (
      <Card className="mb-3 animate-in fade-in duration-300 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 dark:from-blue-500/5 dark:via-indigo-500/5 dark:to-purple-500/5">
        <CardContent className="flex flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            {isNum ? <Hash className="h-4 w-4" /> : <Type className="h-4 w-4" />}
            Result
          </div>
          <p className="text-3xl font-bold tracking-tight text-foreground">
            {formatValue(resultVal)}
          </p>
          <ExecutionTimeBadge time={results.executionTime} />
        </CardContent>
      </Card>
    )
  }

  // --- Array or other fallback ---
  return (
    <Card className="mb-3 animate-in fade-in duration-300">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
          <FlaskConical className="h-4 w-4" />
          Results
        </div>
        <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
          {typeof resultVal === "object" ? JSON.stringify(resultVal, null, 2) : String(resultVal ?? "")}
        </pre>
        <ExecutionTimeBadge time={results.executionTime} />
      </CardContent>
    </Card>
  )
}

function ExecutionTimeBadge({ time }: { time?: number }) {
  if (time == null) return null
  return (
    <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
      <Clock className="h-3 w-3" />
      {time.toFixed(2)}s
    </div>
  )
}
