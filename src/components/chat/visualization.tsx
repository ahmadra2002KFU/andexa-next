"use client"

import { useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { LineChart } from "lucide-react"
import dynamic from "next/dynamic"
import type { PlotData } from "@/types/chat"

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => <Skeleton className="h-[400px] w-full" />,
})

interface VisualizationProps {
  plots?: PlotData[]
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
    if (shape.length > 1) {
      return reshapeValues(values, shape)
    }
    return values
  } catch {
    return null
  }
}

function normalizePlotlyPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizePlotlyPayload)
  }
  if (isPlainObject(value)) {
    const dtype = value.dtype
    const bdata = value.bdata
    if (typeof dtype === "string" && typeof bdata === "string") {
      const decoded = decodeTypedArray(dtype, bdata, value.shape)
      if (decoded) return decoded
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalizePlotlyPayload(v)])
    )
  }
  return value
}

export function Visualization({ plots }: VisualizationProps) {
  useEffect(() => {
    if (!isTraceExecEnabled() || !plots || plots.length === 0) return
    console.log("[TRACE_EXEC] visualization_props", {
      plotCount: plots.length,
      plots: plots.map((p, idx) => ({
        idx,
        dataLen: Array.isArray(p.data) ? p.data.length : 0,
        layoutKeys: p.layout && typeof p.layout === "object" ? Object.keys(p.layout).slice(0, 10) : [],
      })),
    })
  }, [plots])

  if (!plots || plots.length === 0) return null

  return (
    <>
      {plots.map((plot, i) => {
        const normalizedData = normalizePlotlyPayload(plot.data) as Plotly.Data[]
        const normalizedLayout = normalizePlotlyPayload(plot.layout) as Partial<Plotly.Layout> | undefined
        if (isTraceExecEnabled()) {
          const traceSummary = Array.isArray(normalizedData)
            ? normalizedData.map((trace, idx) => ({
                idx,
                type: (trace as Record<string, unknown>)?.type,
                xLen: Array.isArray((trace as Record<string, unknown>)?.x) ? ((trace as Record<string, unknown>)?.x as unknown[]).length : undefined,
                yLen: Array.isArray((trace as Record<string, unknown>)?.y) ? ((trace as Record<string, unknown>)?.y as unknown[]).length : undefined,
              }))
            : []
          console.log("[TRACE_EXEC] visualization_normalized_plot", {
            index: i,
            dataLen: Array.isArray(normalizedData) ? normalizedData.length : 0,
            traceSummary,
            hasLayout: !!normalizedLayout,
            layoutKeys: normalizedLayout ? Object.keys(normalizedLayout).slice(0, 12) : [],
          })
        }
        if (!normalizedData || !Array.isArray(normalizedData) || normalizedData.length === 0) return null
        return (
        <Card key={i} className="mb-3">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <LineChart className="h-4 w-4" />
              Visualization
            </div>
            <div className="max-h-[700px] overflow-auto">
              <Plot
                data={normalizedData}
                layout={{
                  ...normalizedLayout,
                  autosize: true,
                  height: Math.max((normalizedLayout?.height as number) || 450, 300),
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  font: { ...(normalizedLayout?.font as Record<string, unknown> || {}), color: "currentColor" },
                } as Partial<Plotly.Layout>}
                config={{ responsive: true, displayModeBar: true }}
                style={{ width: "100%", minHeight: "300px" }}
                useResizeHandler
              />
            </div>
          </CardContent>
        </Card>
        )
      })}
    </>
  )
}
