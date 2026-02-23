"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import type { Rule } from "@/types/rules"

const priorityToNum: Record<string, number> = { low: 1, medium: 5, high: 10 }
const numToPriority = (n: number): "low" | "medium" | "high" => n >= 8 ? "high" : n >= 3 ? "medium" : "low"

interface RuleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: Rule | null
  onSave: (data: { text: string; category: string; priority: number }) => void
}

export function RuleModal({ open, onOpenChange, rule, onSave }: RuleModalProps) {
  const [text, setText] = useState("")
  const [category, setCategory] = useState("general")
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium")

  useEffect(() => {
    if (rule) {
      setText(rule.text)
      setCategory(rule.category)
      setPriority(numToPriority(rule.priority))
    } else {
      setText("")
      setCategory("general")
      setPriority("medium")
    }
  }, [rule, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    onSave({ text: text.trim(), category, priority: priorityToNum[priority] })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule ? "Edit Rule" : "Add Custom Rule"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="rule-text">Rule Text</Label>
            <Textarea
              id="rule-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Enter your analysis rule or instruction..."
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">{text.length}/500 characters</p>
          </div>
          <div>
            <Label htmlFor="rule-category">Category</Label>
            <Input
              id="rule-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., formatting, analysis, security"
            />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!text.trim()}>
              {rule ? "Update" : "Add"} Rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
