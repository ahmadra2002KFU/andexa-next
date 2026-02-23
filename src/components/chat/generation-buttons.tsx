"use client"

import { Button } from "@/components/ui/button"
import { FileText, LayoutDashboard } from "lucide-react"
import { useState, useCallback } from "react"

interface GenerationButtonsProps {
  onGenerateReport?: () => void
  onGenerateDashboard?: () => void
}

export function GenerationButtons({ onGenerateReport, onGenerateDashboard }: GenerationButtonsProps) {
  const [reportLoading, setReportLoading] = useState(false)
  const [dashboardLoading, setDashboardLoading] = useState(false)

  const handleReport = useCallback(async () => {
    setReportLoading(true)
    try {
      await onGenerateReport?.()
    } finally {
      setReportLoading(false)
    }
  }, [onGenerateReport])

  const handleDashboard = useCallback(async () => {
    setDashboardLoading(true)
    try {
      await onGenerateDashboard?.()
    } finally {
      setDashboardLoading(false)
    }
  }, [onGenerateDashboard])

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleReport} disabled={reportLoading}>
        <FileText className="mr-2 h-3.5 w-3.5" />
        {reportLoading ? "Generating..." : "Generate Report"}
      </Button>
      <Button variant="outline" size="sm" onClick={handleDashboard} disabled={dashboardLoading}>
        <LayoutDashboard className="mr-2 h-3.5 w-3.5" />
        {dashboardLoading ? "Generating..." : "Generate Dashboard"}
      </Button>
    </div>
  )
}
