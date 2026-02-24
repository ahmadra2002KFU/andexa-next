"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  FlaskConical,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Table2,
  Type,
} from "lucide-react"
import type { ExecutionResult } from "@/types/chat"
import { cn } from "@/lib/utils"
import {
  RESPONSE_BLOCK_CARD_CLASS,
  RESPONSE_BLOCK_CONTENT_CLASS,
  RESPONSE_BLOCK_HEADER_CLASS,
} from "./block-styles"

interface ResultsSectionProps {
  results?: ExecutionResult
  isStreaming?: boolean
}

type SectionKey = "kpis" | "tables" | "data"

interface DataFrameLike {
  columns: string[]
  data: Record<string, unknown>[]
  totalRows: number
  truncated: boolean
}

interface KpiItem {
  id: string
  label: string
  value: unknown
}

interface TableItem {
  id: string
  title: string
  table: DataFrameLike
}

interface DataItem {
  id: string
  title: string
  value: unknown
}

interface ParsedResults {
  kpis: KpiItem[]
  tables: TableItem[]
  data: DataItem[]
}

function isTraceExecEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ANDEXA_TRACE_EXECUTION === "1" || process.env.NODE_ENV !== "production") {
    return true
  }
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("ANDEXA_TRACE_EXECUTION") === "1"
  }
  return false
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "N/A"
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return String(val)
    if (Number.isInteger(val)) return val.toLocaleString("en-US")
    return val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }
  if (typeof val === "boolean") return val ? "Yes" : "No"
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]"
    if (val.every((item) => typeof item !== "object" || item === null)) return val.join(", ")
    return `${val.length} items`
  }
  if (typeof val === "object") return `${Object.keys(val as Record<string, unknown>).length} fields`
  return String(val)
}

function detectUnit(key: string, val: unknown): string {
  const k = key.toLowerCase()
  if (typeof val === "number") {
    if (k.includes("percent") || k.includes("rate") || k.includes("ratio") || k.endsWith("_%") || k.endsWith("_pct")) {
      return "%"
    }
    if (k.includes("cost") || k.includes("price") || k.includes("revenue") || k.includes("salary") || k.includes("amount") || k.includes("sar")) {
      return "SAR "
    }
  }
  return ""
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val)
}

function isScalarValue(val: unknown): boolean {
  return val === null || val === undefined || typeof val === "string" || typeof val === "number" || typeof val === "boolean"
}

function isSerializedDataFrame(val: unknown): val is Record<string, unknown> {
  if (!isPlainObject(val)) return false
  return (
    val.type === "dataframe" &&
    Array.isArray(val.columns) &&
    (Array.isArray(val.head) || Array.isArray(val.data))
  )
}

function isArrayOfObjects(val: unknown): val is Record<string, unknown>[] {
  return Array.isArray(val) && val.length > 0 && val.every((item) => isPlainObject(item))
}

function isPlotlyFigure(val: unknown): boolean {
  return isPlainObject(val) && val.type === "plotly_figure"
}

function toDataFrameTableData(df: Record<string, unknown>): DataFrameLike {
  const rows = (Array.isArray(df.data) ? df.data : df.head) as Record<string, unknown>[] | undefined
  return {
    columns: (df.columns as string[]) ?? [],
    data: rows ?? [],
    totalRows: Number(df.total_rows ?? df.totalRows ?? rows?.length ?? 0),
    truncated: Boolean(df.truncated ?? false),
  }
}

function toArrayTableData(rows: Record<string, unknown>[]): DataFrameLike {
  const displayRows = rows.slice(0, 50)
  const columns = Array.from(
    displayRows.reduce((acc, row) => {
      Object.keys(row).forEach((key) => acc.add(key))
      return acc
    }, new Set<string>())
  )
  return {
    columns,
    data: displayRows,
    totalRows: rows.length,
    truncated: rows.length > 50,
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseResults(results: ExecutionResult): ParsedResults {
  const parsed: ParsedResults = { kpis: [], tables: [], data: [] }
  let kpiIndex = 0
  let tableIndex = 0
  let dataIndex = 0

  if (results.dataframe) {
    parsed.tables.push({
      id: `table-${tableIndex++}`,
      title: "Primary Results Table",
      table: results.dataframe,
    })
  }

  const resultVal = results.result
  if (resultVal === null || resultVal === undefined) return parsed

  if (isScalarValue(resultVal)) {
    parsed.kpis.push({
      id: `kpi-${kpiIndex++}`,
      label: "Result",
      value: resultVal,
    })
    return parsed
  }

  if (isArrayOfObjects(resultVal)) {
    parsed.tables.push({
      id: `table-${tableIndex++}`,
      title: "Result Items",
      table: toArrayTableData(resultVal),
    })
    return parsed
  }

  if (Array.isArray(resultVal)) {
    parsed.data.push({
      id: `data-${dataIndex++}`,
      title: "Result Array",
      value: resultVal,
    })
    return parsed
  }

  if (!isPlainObject(resultVal)) {
    parsed.data.push({
      id: `data-${dataIndex++}`,
      title: "Result",
      value: resultVal,
    })
    return parsed
  }

  for (const [key, value] of Object.entries(resultVal)) {
    if (isPlotlyFigure(value)) continue

    if (isSerializedDataFrame(value)) {
      parsed.tables.push({
        id: `table-${tableIndex++}`,
        title: humanizeKey(key),
        table: toDataFrameTableData(value),
      })
      continue
    }

    if (isArrayOfObjects(value)) {
      parsed.tables.push({
        id: `table-${tableIndex++}`,
        title: humanizeKey(key),
        table: toArrayTableData(value),
      })
      continue
    }

    if (isScalarValue(value)) {
      parsed.kpis.push({
        id: `kpi-${kpiIndex++}`,
        label: humanizeKey(key),
        value,
      })
      continue
    }

    if (Array.isArray(value)) {
      parsed.data.push({
        id: `data-${dataIndex++}`,
        title: humanizeKey(key),
        value,
      })
      continue
    }

    if (isPlainObject(value)) {
      const nested = Object.entries(value).filter(([, v]) => !isPlotlyFigure(v))
      const nestedScalar = nested.filter(([, v]) => isScalarValue(v))
      const nestedComplex = nested.filter(([, v]) => !isScalarValue(v))

      for (const [nestedKey, nestedValue] of nestedScalar) {
        parsed.kpis.push({
          id: `kpi-${kpiIndex++}`,
          label: `${humanizeKey(key)} - ${humanizeKey(nestedKey)}`,
          value: nestedValue,
        })
      }

      for (const [nestedKey, nestedValue] of nestedComplex) {
        if (isSerializedDataFrame(nestedValue)) {
          parsed.tables.push({
            id: `table-${tableIndex++}`,
            title: `${humanizeKey(key)} - ${humanizeKey(nestedKey)}`,
            table: toDataFrameTableData(nestedValue),
          })
        } else if (isArrayOfObjects(nestedValue)) {
          parsed.tables.push({
            id: `table-${tableIndex++}`,
            title: `${humanizeKey(key)} - ${humanizeKey(nestedKey)}`,
            table: toArrayTableData(nestedValue),
          })
        } else {
          parsed.data.push({
            id: `data-${dataIndex++}`,
            title: `${humanizeKey(key)} - ${humanizeKey(nestedKey)}`,
            value: nestedValue,
          })
        }
      }
      continue
    }

    parsed.data.push({
      id: `data-${dataIndex++}`,
      title: humanizeKey(key),
      value,
    })
  }

  return parsed
}

function KpiCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  const isNumber = /^[\d,.-]+$/.test(value.replace(/\s/g, ""))
  return (
    <Card className="gap-0 border-border/50 bg-muted/25 py-0 shadow-none transition-colors hover:bg-muted/40">
      <CardContent className="p-2.5">
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

function DataFrameTable({ df }: { df: DataFrameLike }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Badge variant="secondary" className="text-[10px]">
          Showing {df.data.length} of {df.totalRows.toLocaleString()} rows
          {df.truncated && " (truncated)"}
        </Badge>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="sticky top-0 bg-muted/70">
              {df.columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-2.5 py-1.5 text-left font-semibold text-foreground">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {df.data.map((row, i) => (
              <tr key={i} className={cn("border-t border-border/50", i % 2 === 1 && "bg-muted/20")}>
                {df.columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-2.5 py-1.5 text-foreground/80">
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

function SectionContainer({
  title,
  count,
  open,
  onOpenChange,
  children,
}: {
  title: string
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="overflow-hidden rounded-md border border-border/70">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between bg-muted/30 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/50">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {title}
              <Badge variant="secondary" className="text-[10px]">
                {count}
              </Badge>
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
          <div className="p-2.5">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function ResultsSection({ results, isStreaming }: ResultsSectionProps) {
  const parsed = useMemo(() => (results ? parseResults(results) : null), [results])
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    kpis: true,
    tables: false,
    data: false,
  })
  const [showAllKpis, setShowAllKpis] = useState(false)

  useEffect(() => {
    if (!isTraceExecEnabled() || !results || !parsed) return
    const resultVal = results.result
    const resultType = resultVal === undefined ? "undefined" : Array.isArray(resultVal) ? "array" : typeof resultVal
    const resultKeys = isPlainObject(resultVal) ? Object.keys(resultVal).slice(0, 15) : []
    console.log("[TRACE_EXEC] results_section_props", {
      success: results.success,
      hasError: !!results.error,
      resultType,
      resultKeys,
      kpiCount: parsed.kpis.length,
      tableCount: parsed.tables.length,
      dataCount: parsed.data.length,
      executionTime: results.executionTime,
    })
  }, [results, parsed])

  if (!results && !isStreaming) return null

  if (isStreaming && !results) {
    return (
      <Card className={cn(RESPONSE_BLOCK_CARD_CLASS, "animate-in fade-in duration-300")}>
        <div className={RESPONSE_BLOCK_HEADER_CLASS}>
          <FlaskConical className="h-4 w-4" />
          Results
        </div>
        <CardContent className={RESPONSE_BLOCK_CONTENT_CLASS}>
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!results || !parsed) return null

  const hasNoContent = !results.success && !results.error && !results.result && !results.dataframe
  if (hasNoContent) return null

  if (!results.success && results.error) {
    return (
      <Card
        className={cn(
          RESPONSE_BLOCK_CARD_CLASS,
          "animate-in fade-in border-destructive/30 bg-destructive/5 duration-300"
        )}
      >
        <div className={cn(RESPONSE_BLOCK_HEADER_CLASS, "border-destructive/30 bg-destructive/10 text-destructive")}>
          <AlertCircle className="h-4 w-4" />
          Execution Error
        </div>
        <CardContent className={RESPONSE_BLOCK_CONTENT_CLASS}>
          <pre className="whitespace-pre-wrap rounded-md bg-destructive/10 p-2.5 font-mono text-xs text-destructive">
            {results.error}
          </pre>
        </CardContent>
      </Card>
    )
  }

  const availableSections: SectionKey[] = ([
    parsed.kpis.length > 0 ? "kpis" : null,
    parsed.tables.length > 0 ? "tables" : null,
    parsed.data.length > 0 ? "data" : null,
  ].filter(Boolean) as SectionKey[])

  if (availableSections.length === 0) {
    return (
      <Card className={cn(RESPONSE_BLOCK_CARD_CLASS, "animate-in fade-in duration-300")}>
        <div className={RESPONSE_BLOCK_HEADER_CLASS}>
          <FlaskConical className="h-4 w-4" />
          Results
        </div>
        <CardContent className={RESPONSE_BLOCK_CONTENT_CLASS}>
          <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-2.5 text-xs">
            {typeof results.result === "object" ? safeJson(results.result) : String(results.result ?? "")}
          </pre>
          <ExecutionTimeBadge time={results.executionTime} />
        </CardContent>
      </Card>
    )
  }

  const allExpanded = availableSections.every((key) => openSections[key])
  const visibleKpis = showAllKpis ? parsed.kpis : parsed.kpis.slice(0, 12)

  return (
    <Card className={cn(RESPONSE_BLOCK_CARD_CLASS, "animate-in fade-in duration-300")}>
      <CardContent className="space-y-2.5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <FlaskConical className="h-4 w-4" />
            Results Workspace
            <Badge variant="secondary" className="text-[10px]">
              {availableSections.length} sections
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              const next = !allExpanded
              setOpenSections({
                kpis: next && parsed.kpis.length > 0,
                tables: next && parsed.tables.length > 0,
                data: next && parsed.data.length > 0,
              })
            }}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>

        {parsed.kpis.length > 0 && (
          <SectionContainer
            title="KPIs"
            count={parsed.kpis.length}
            open={openSections.kpis}
            onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, kpis: open }))}
          >
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {visibleKpis.map((kpi) => {
                  const unit = detectUnit(kpi.label, kpi.value)
                  return (
                    <KpiCard
                      key={kpi.id}
                      label={kpi.label}
                      value={formatValue(kpi.value)}
                      unit={unit}
                    />
                  )
                })}
              </div>
              {parsed.kpis.length > 12 && (
                <button
                  onClick={() => setShowAllKpis((v) => !v)}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {showAllKpis ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {showAllKpis ? "Show less" : `Show all ${parsed.kpis.length} KPIs`}
                </button>
              )}
            </div>
          </SectionContainer>
        )}

        {parsed.tables.length > 0 && (
          <SectionContainer
            title="Tables"
            count={parsed.tables.length}
            open={openSections.tables}
            onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, tables: open }))}
          >
            <div className="space-y-2.5">
              {parsed.tables.map((item) => (
                <Card key={item.id} className="gap-0 border-border/60 py-0">
                  <CardContent className="space-y-1.5 p-2.5">
                    <p className="text-xs font-semibold text-muted-foreground">{item.title}</p>
                    <DataFrameTable df={item.table} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionContainer>
        )}

        {parsed.data.length > 0 && (
          <SectionContainer
            title="Data"
            count={parsed.data.length}
            open={openSections.data}
            onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, data: open }))}
          >
            <div className="space-y-1.5">
              {parsed.data.map((item) => (
                <details key={item.id} className="rounded-md border border-border/70 bg-muted/20 open:bg-muted/30">
                  <summary className="cursor-pointer list-none px-2.5 py-1.5 text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-2">
                      <Type className="h-3.5 w-3.5 text-muted-foreground" />
                      {item.title}
                    </span>
                  </summary>
                  <div className="px-2.5 pb-2.5">
                    <pre className="max-h-56 overflow-auto rounded-md bg-background/70 p-2.5 text-xs text-foreground/80">
                      {safeJson(item.value)}
                    </pre>
                  </div>
                </details>
              ))}
            </div>
          </SectionContainer>
        )}

        <ExecutionTimeBadge time={results.executionTime} />
      </CardContent>
    </Card>
  )
}

function ExecutionTimeBadge({ time }: { time?: number }) {
  if (time == null) return null
  return (
    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
      <Clock className="h-3 w-3" />
      {time.toFixed(2)}s
    </div>
  )
}
