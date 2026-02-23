"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Maximize2, Minimize2, Download, X } from "lucide-react"
import { useState } from "react"

interface DashboardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardUrl?: string
  title?: string
}

export function DashboardModal({ open, onOpenChange, dashboardUrl, title = "Interactive Dashboard" }: DashboardModalProps) {
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-none p-0 ${fullscreen ? "h-screen w-screen" : "h-[85vh] w-[90vw]"}`}>
        <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
          <h2 className="text-lg font-bold">{title}</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-white/20"
              onClick={() => setFullscreen(!fullscreen)}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-white/20">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Download HTML</DropdownMenuItem>
                <DropdownMenuItem>Download PDF</DropdownMenuItem>
                <DropdownMenuItem>Download PNG</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-white/20"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {dashboardUrl ? (
            <iframe
              src={dashboardUrl}
              className="h-full w-full"
              sandbox="allow-scripts allow-same-origin allow-downloads"
              title="Interactive Dashboard"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="font-medium">Generating dashboard...</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
