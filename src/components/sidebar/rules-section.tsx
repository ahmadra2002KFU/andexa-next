"use client"

import { useRules } from "@/hooks/use-rules"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ChevronDown, ListChecks, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { RuleModal } from "@/components/modals/rule-modal"
import type { Rule } from "@/types/rules"

export function RulesSection() {
  const { rules, addRule, updateRule, deleteRule } = useRules()
  const [open, setOpen] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)

  const handleSave = async (data: { text: string; category: string; priority: number }) => {
    if (editingRule) {
      await updateRule(editingRule.id, data)
    } else {
      await addRule(data)
    }
    setModalOpen(false)
    setEditingRule(null)
  }

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Custom Rules
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 py-2">
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                setEditingRule(null)
                setModalOpen(true)
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Rule
            </Button>
            {rules.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-2">No custom rules defined</p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted cursor-pointer"
                    onClick={() => {
                      setEditingRule(rule)
                      setModalOpen(true)
                    }}
                  >
                    <span className="truncate flex-1">{rule.text}</span>
                    <button
                      className="ml-2 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteRule(rule.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <RuleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        rule={editingRule}
        onSave={handleSave}
      />
    </>
  )
}
