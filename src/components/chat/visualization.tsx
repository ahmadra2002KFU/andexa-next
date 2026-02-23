"use client"

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

export function Visualization({ plots }: VisualizationProps) {
  if (!plots || plots.length === 0) return null

  return (
    <>
      {plots.map((plot, i) => (
        <Card key={i} className="mb-3">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
              <LineChart className="h-4 w-4" />
              Visualization
            </div>
            <div className="max-h-[700px] overflow-auto">
              <Plot
                data={plot.data as Plotly.Data[]}
                layout={{
                  ...plot.layout,
                  autosize: true,
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  font: { color: "currentColor" },
                } as Partial<Plotly.Layout>}
                config={{ responsive: true, displayModeBar: true }}
                style={{ width: "100%", height: "100%" }}
                useResizeHandler
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
