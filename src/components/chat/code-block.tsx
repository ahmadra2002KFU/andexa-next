"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Code, Copy, Check, ChevronDown, ChevronRight } from "lucide-react"
import { useState, useCallback } from "react"
import { useSettingsStore } from "@/stores/settings-store"
import { cn } from "@/lib/utils"
import {
  RESPONSE_BLOCK_CARD_CLASS,
  RESPONSE_BLOCK_HEADER_CLASS,
  RESPONSE_BLOCK_HEADER_INTERACTIVE_CLASS,
} from "./block-styles"

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
    <Card className={RESPONSE_BLOCK_CARD_CLASS}>
      <CardContent className="p-0">
        <div
          className={cn(
            RESPONSE_BLOCK_HEADER_CLASS,
            RESPONSE_BLOCK_HEADER_INTERACTIVE_CLASS,
            "justify-between"
          )}
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            Python Code
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation()
              handleCopy()
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {expanded && (
          <pre className="max-h-[28rem] overflow-auto bg-zinc-950 p-3 text-sm text-zinc-100">
            <code>{code}</code>
          </pre>
        )}
      </CardContent>
    </Card>
  )
}
