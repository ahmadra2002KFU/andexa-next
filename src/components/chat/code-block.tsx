"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Code, Copy, Check, ChevronDown, ChevronRight } from "lucide-react"
import { useState, useCallback } from "react"
import { useSettingsStore } from "@/stores/settings-store"

interface CodeBlockProps {
  code: string
}

export function CodeBlock({ code }: CodeBlockProps) {
  const autoExpand = useSettingsStore((s) => s.autoExpandCode)
  const [expanded, setExpanded] = useState(autoExpand)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  if (!code) return null

  return (
    <Card className="mb-3 overflow-hidden">
      <CardContent className="p-0">
        <div
          className="flex cursor-pointer items-center justify-between bg-muted/50 px-4 py-2"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Code className="h-4 w-4" />
            Python Code
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={(e) => {
              e.stopPropagation()
              handleCopy()
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {expanded && (
          <pre className="max-h-96 overflow-auto bg-zinc-950 p-4 text-sm text-zinc-100">
            <code>{code}</code>
          </pre>
        )}
      </CardContent>
    </Card>
  )
}
