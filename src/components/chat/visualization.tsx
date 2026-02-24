"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  LineChart,
  LayoutGrid,
  Rows3,
  Maximize2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import dynamic from "next/dynamic"
import type { PlotData } from "@/types/chat"

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full" />,
})

interface VisualizationProps {
  plots?: PlotData[]
}

interface PlotItem {
  id: string
  title: string
  plot: PlotData
}

type PlotLayoutMode = "rows" | "grid"

function isTraceExecEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ANDEXA_TRACE_EXECUTION === "1" || process.env.NODE_ENV !== "production") {
    return true
  }
  if (typeof window !== "undefined") {
    return window.localStorage.getItem("ANDEXA_TRACE_EXECUTION") === "1"
  }
  return false
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val)
}

function reshapeValues(values: number[], shape: number[]): unknown[] {
  if (shape.length <= 1) return values
  const [head, ...tail] = shape
  if (!Number.isInteger(head) || head <= 0) return values
  const chunk = Math.floor(values.length / head)
  const out: unknown[] = []
  for (let i = 0; i < head; i++) {
    out.push(reshapeValues(values.slice(i * chunk, (i + 1) * chunk), tail))
  }
  return out
}

function decodeTypedArray(dtypeRaw: string, bdata: string, shapeRaw?: unknown): unknown[] | null {
  try {
    const dtype = dtypeRaw.replace(/[<>=|]/g, "")
    const binary = atob(bdata)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const makeArray = <T extends ArrayLike<number | bigint>>(ctor: {
      new (buffer: ArrayBuffer, byteOffset?: number, length?: number): T
      BYTES_PER_ELEMENT: number
    }): number[] | null => {
      if (bytes.byteLength % ctor.BYTES_PER_ELEMENT !== 0) return null
      const arr = new ctor(bytes.buffer, bytes.byteOffset, bytes.byteLength / ctor.BYTES_PER_ELEMENT)
      return Array.from(arr, (v) => Number(v))
    }

    let values: number[] | null = null
    switch (dtype) {
      case "f8":
        values = makeArray(Float64Array)
        break
      case "f4":
        values = makeArray(Float32Array)
        break
      case "i1":
        values = makeArray(Int8Array)
        break
      case "i2":
        values = makeArray(Int16Array)
        break
      case "i4":
        values = makeArray(Int32Array)
        break
      case "u1":
        values = makeArray(Uint8Array)
        break
      case "u2":
        values = makeArray(Uint16Array)
        break
      case "u4":
        values = makeArray(Uint32Array)
        break
      case "i8":
        values = typeof BigInt64Array !== "undefined" ? makeArray(BigInt64Array) : null
        break
      case "u8":
        values = typeof BigUint64Array !== "undefined" ? makeArray(BigUint64Array) : null
        break
      default:
        return null
    }
    if (!values) return null
    const shape = Array.isArray(shapeRaw)
      ? shapeRaw.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0)
      : []
    if (shape.length > 1) return reshapeValues(values, shape)
    return values
  } catch {
    return null
  }
}

function normalizePlotlyPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizePlotlyPayload)
  if (isPlainObject(value)) {
    const dtype = value.dtype
    const bdata = value.bdata
    if (typeof dtype === "string" && typeof bdata === "string") {
      const decoded = decodeTypedArray(dtype, bdata, value.shape)
      if (decoded) return decoded
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizePlotlyPayload(v)]))
  }
  return value
}

function normalizePlot(plot: PlotData): PlotData {
  return {
    data: normalizePlotlyPayload(plot.data) as unknown[],
    layout: normalizePlotlyPayload(plot.layout) as Record<string, unknown>,
  }
}

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

function extractPlotTitle(plot: PlotData, index: number): string {
  const layout = (plot.layout ?? {}) as Record<string, unknown>
  const title = layout.title
  if (typeof title === "string" && title.trim()) return title.trim()
  if (isPlainObject(title) && typeof title.text === "string" && title.text.trim()) return title.text.trim()
  return `Chart ${index + 1}`
}

function axisRefToLayoutKey(ref: string, axis: "x" | "y"): string {
  const suffix = ref.slice(1)
  return suffix ? `${axis}axis${suffix}` : `${axis}axis`
}

function getAxisDomain(layout: Record<string, unknown>, ref: string, axis: "x" | "y"): [number, number] {
  const key = axisRefToLayoutKey(ref, axis)
  const axisObj = layout[key]
  if (isPlainObject(axisObj) && Array.isArray(axisObj.domain) && axisObj.domain.length === 2) {
    const start = Number(axisObj.domain[0])
    const end = Number(axisObj.domain[1])
    if (Number.isFinite(start) && Number.isFinite(end)) return [start, end]
  }
  return [0, 1]
}

function getAnnotationCandidates(layout: Record<string, unknown>): Array<{ text: string; x: number; y: number }> {
  const annotations = layout.annotations
  if (!Array.isArray(annotations)) return []
  const out: Array<{ text: string; x: number; y: number }> = []
  for (const ann of annotations) {
    if (!isPlainObject(ann)) continue
    if (typeof ann.text !== "string") continue
    const x = Number(ann.x)
    const y = Number(ann.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.push({ text: ann.text, x, y })
  }
  return out
}

function nearestTitle(
  candidates: Array<{ text: string; x: number; y: number }>,
  centerX: number,
  centerY: number,
  fallback: string
): string {
  if (candidates.length === 0) return fallback
  let best = candidates[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const c of candidates) {
    const d = Math.hypot(c.x - centerX, c.y - centerY)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return bestDist < 0.45 ? best.text : fallback
}

function splitPlotIntoPanels(plot: PlotData, baseIndex: number): PlotItem[] {
  const data = Array.isArray(plot.data) ? (plot.data as Record<string, unknown>[]) : []
  const layout = isPlainObject(plot.layout) ? (plot.layout as Record<string, unknown>) : {}
  const rootTitle = extractPlotTitle(plot, baseIndex)
  if (data.length === 0) return []

  type GroupMeta = {
    traces: Record<string, unknown>[]
    kind: "axis" | "domain" | "generic"
    xRef?: string
    yRef?: string
    domain?: { x: [number, number]; y: [number, number] }
  }

  const groups = new Map<string, GroupMeta>()
  for (let i = 0; i < data.length; i++) {
    const trace = data[i]
    const explicitXRef = typeof trace.xaxis === "string" ? trace.xaxis : undefined
    const explicitYRef = typeof trace.yaxis === "string" ? trace.yaxis : undefined
    const xRef = explicitXRef ?? "x"
    const yRef = explicitYRef ?? "y"
    const domain = isPlainObject(trace.domain) ? trace.domain : null
    const domainX = domain && Array.isArray(domain.x) && domain.x.length === 2 ? [Number(domain.x[0]), Number(domain.x[1])] as [number, number] : null
    const domainY = domain && Array.isArray(domain.y) && domain.y.length === 2 ? [Number(domain.y[0]), Number(domain.y[1])] as [number, number] : null
    const hasDomain = !!(domainX && domainY && domainX.every(Number.isFinite) && domainY.every(Number.isFinite))
    const hasCartesianData = "x" in trace || "y" in trace || explicitXRef !== undefined || explicitYRef !== undefined

    let key = `trace:${i}`
    let meta: GroupMeta = { traces: [trace], kind: "generic" }

    if (hasCartesianData && !hasDomain) {
      key = `axis:${xRef}|${yRef}`
      meta = { traces: [trace], kind: "axis", xRef, yRef }
    } else if (hasDomain && domainX && domainY) {
      key = `domain:${domainX.join("-")}:${domainY.join("-")}`
      meta = { traces: [trace], kind: "domain", domain: { x: domainX, y: domainY } }
    }

    const existing = groups.get(key)
    if (existing) {
      existing.traces.push(trace)
    } else {
      groups.set(key, meta)
    }
  }

  if (groups.size <= 1) {
    return [{ id: `plot-${baseIndex}-0`, title: rootTitle, plot }]
  }

  const titles = getAnnotationCandidates(layout)
  const globalLayout = deepClone(layout)
  delete globalLayout.annotations
  delete globalLayout.grid
  delete globalLayout.width
  delete globalLayout.height
  delete globalLayout.xaxis2
  delete globalLayout.xaxis3
  delete globalLayout.xaxis4
  delete globalLayout.xaxis5
  delete globalLayout.yaxis2
  delete globalLayout.yaxis3
  delete globalLayout.yaxis4
  delete globalLayout.yaxis5

  let itemIndex = 0
  const out: PlotItem[] = []
  for (const [, group] of groups) {
    const traces = group.traces.map((t) => deepClone(t))
    let centerX = 0.5
    let centerY = 0.5
    const panelLayout: Record<string, unknown> = deepClone(globalLayout)

    if (group.kind === "axis") {
      const xRef = group.xRef || "x"
      const yRef = group.yRef || "y"
      const [x0, x1] = getAxisDomain(layout, xRef, "x")
      const [y0, y1] = getAxisDomain(layout, yRef, "y")
      centerX = (x0 + x1) / 2
      centerY = (y0 + y1) / 2

      const srcX = deepClone(layout[axisRefToLayoutKey(xRef, "x")] ?? {})
      const srcY = deepClone(layout[axisRefToLayoutKey(yRef, "y")] ?? {})
      if (isPlainObject(srcX)) {
        delete srcX.domain
        delete srcX.anchor
        delete srcX.matches
      }
      if (isPlainObject(srcY)) {
        delete srcY.domain
        delete srcY.anchor
        delete srcY.matches
      }
      panelLayout.xaxis = srcX
      panelLayout.yaxis = srcY

      for (const trace of traces) {
        trace.xaxis = "x"
        trace.yaxis = "y"
      }
    } else if (group.kind === "domain" && group.domain) {
      centerX = (group.domain.x[0] + group.domain.x[1]) / 2
      centerY = (group.domain.y[0] + group.domain.y[1]) / 2
      for (const trace of traces) {
        delete trace.domain
      }
    }

    const fallback = `${rootTitle} - Panel ${itemIndex + 1}`
    const panelTitle = nearestTitle(titles, centerX, centerY, fallback)
    panelLayout.title = { text: panelTitle }
    panelLayout.showlegend = traces.length > 1

    out.push({
      id: `plot-${baseIndex}-${itemIndex}`,
      title: panelTitle,
      plot: { data: traces, layout: panelLayout },
    })
    itemIndex += 1
  }

  return out
}

function PlotPanel({
  plot,
  title,
  height,
  className,
}: {
  plot: PlotData
  title: string
  height: number
  className?: string
}) {
  const data = plot.data as Plotly.Data[]
  const layout = (plot.layout ?? {}) as Partial<Plotly.Layout>

  return (
    <div className={cn("rounded-xl border bg-card/70 p-3 shadow-sm transition-all duration-300", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="truncate text-sm font-semibold text-foreground" title={title}>
          {title}
        </h4>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background/70 p-2">
        <Plot
          data={data}
          layout={{
            ...layout,
            autosize: true,
            height,
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            margin: {
              l: Math.max(((layout?.margin as Plotly.Margin)?.l as number) || 0, 55),
              r: Math.max(((layout?.margin as Plotly.Margin)?.r as number) || 0, 30),
              t: Math.max(((layout?.margin as Plotly.Margin)?.t as number) || 0, 60),
              b: Math.max(((layout?.margin as Plotly.Margin)?.b as number) || 0, 50),
            },
            font: {
              ...(((layout?.font as Record<string, unknown>) || {}) as Partial<Plotly.Font>),
              color: "currentColor",
            },
          }}
          config={{
            responsive: true,
            displayModeBar: true,
            scrollZoom: true,
            displaylogo: false,
          }}
          style={{ width: "100%", minWidth: "620px", height: `${height}px` }}
          useResizeHandler
        />
      </div>
    </div>
  )
}

export function Visualization({ plots }: VisualizationProps) {
  const [expanded, setExpanded] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [inlineMode, setInlineMode] = useState<PlotLayoutMode>("rows")
  const [workspaceMode, setWorkspaceMode] = useState<PlotLayoutMode>("grid")

  const normalizedPlots = useMemo(() => {
    if (!plots || plots.length === 0) return []
    return plots.map((plot) => normalizePlot(plot)).filter((plot) => Array.isArray(plot.data) && plot.data.length > 0)
  }, [plots])

  const plotItems = useMemo(() => {
    const out: PlotItem[] = []
    normalizedPlots.forEach((plot, idx) => {
      out.push(...splitPlotIntoPanels(plot, idx))
    })
    return out
  }, [normalizedPlots])

  useEffect(() => {
    if (!isTraceExecEnabled() || plotItems.length === 0) return
    console.log("[TRACE_EXEC] visualization_props", {
      plotCount: plotItems.length,
      titles: plotItems.map((item) => item.title),
      sourceCount: normalizedPlots.length,
    })
  }, [plotItems, normalizedPlots.length])

  if (plotItems.length === 0) return null

  return (
    <div>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div
            className="flex cursor-pointer items-center justify-between bg-muted/50 px-4 py-2 transition-colors hover:bg-muted/70"
            onClick={() => setExpanded((v) => !v)}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <LineChart className="h-4 w-4" />
              Visualization
              <Badge variant="secondary" className="text-[10px]">
                {plotItems.length} charts
              </Badge>
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={inlineMode === "rows" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation()
                  setInlineMode("rows")
                }}
              >
                <Rows3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={inlineMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation()
                  setInlineMode("grid")
                }}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation()
                  setDialogOpen(true)
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className={cn("overflow-hidden transition-all duration-300 ease-out", expanded ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0")}>
            <div className="max-h-[920px] overflow-y-auto p-3">
              <div
                className={cn(
                  inlineMode === "grid" ? "grid grid-cols-1 gap-3 xl:grid-cols-2" : "flex flex-col gap-3"
                )}
              >
                {plotItems.map((item) => (
                  <PlotPanel
                    key={item.id}
                    plot={item.plot}
                    title={item.title}
                    height={inlineMode === "grid" ? 410 : 480}
                    className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                  />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="h-[92vh] w-[98vw] max-w-[98vw] overflow-hidden p-0 sm:max-w-[98vw]">
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="border-b px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <DialogTitle className="text-base">Visualization Workspace</DialogTitle>
                  <DialogDescription>
                    Explore each chart with full controls and larger interaction space.
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
                  <Button
                    variant={workspaceMode === "rows" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setWorkspaceMode("rows")}
                  >
                    <Rows3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={workspaceMode === "grid" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setWorkspaceMode("grid")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
              <div className={cn(workspaceMode === "grid" ? "grid grid-cols-1 gap-4 2xl:grid-cols-2" : "flex flex-col gap-4")}>
                {plotItems.map((item) => (
                  <PlotPanel
                    key={`modal-${item.id}`}
                    plot={item.plot}
                    title={item.title}
                    height={workspaceMode === "grid" ? 450 : 560}
                    className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
