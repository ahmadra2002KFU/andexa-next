"use client"

import { useFileStore } from "@/stores/file-store"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, FileText } from "lucide-react"
import { useState } from "react"

export function FileInfo() {
  const metadata = useFileStore((s) => s.metadata)
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          File Info
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1.5 py-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Rows:</span>
            <span className="font-medium text-foreground">{metadata?.rows ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span>Columns:</span>
            <span className="font-medium text-foreground">{metadata?.columns ?? "-"}</span>
          </div>
          <div className="flex justify-between">
            <span>Size:</span>
            <span className="font-medium text-foreground">{metadata?.size ?? "-"}</span>
          </div>
          {metadata?.columnList && metadata.columnList.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto">
              <p className="mb-1 font-medium text-foreground">Columns:</p>
              {metadata.columnList.map((col) => (
                <div key={col.name} className="flex justify-between pl-2">
                  <span className="truncate">{col.name}</span>
                  <span className="text-muted-foreground">{col.dtype}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
