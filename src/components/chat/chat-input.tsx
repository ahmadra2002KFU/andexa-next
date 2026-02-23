"use client"

import { useRef, useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Paperclip, Mic } from "lucide-react"
import { useFileUpload } from "@/hooks/use-file-upload"

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  defaultValue?: string
}

export function ChatInput({ onSend, disabled, defaultValue }: ChatInputProps) {
  const [value, setValue] = useState(defaultValue || "")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { upload } = useFileUpload()

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) upload(file)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [upload]
  )

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 128) + "px"
  }, [])

  // Sync defaultValue when it changes (e.g. from example click)
  if (defaultValue && defaultValue !== value && value === "") {
    setValue(defaultValue)
  }

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question or upload a file..."
            rows={1}
            className="min-h-[36px] max-h-32 resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
          >
            <Mic className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={disabled || !value.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
