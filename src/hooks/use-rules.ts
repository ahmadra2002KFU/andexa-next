"use client"

import { useState, useCallback, useEffect } from "react"
import type { Rule } from "@/types/rules"

export function useRules() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(false)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/rules")
      if (res.ok) {
        const data = await res.json()
        setRules(data.rules || data || [])
      }
    } catch {
      // API may not exist yet
    } finally {
      setLoading(false)
    }
  }, [])

  const addRule = useCallback(async (rule: Omit<Rule, "id" | "createdAt">) => {
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      })
      if (res.ok) {
        const data = await res.json()
        setRules((prev) => [...prev, data])
        return data as Rule
      }
    } catch {
      // fallback: add locally
      const local: Rule = {
        ...rule,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }
      setRules((prev) => [...prev, local])
      return local
    }
  }, [])

  const updateRule = useCallback(async (id: string, updates: Partial<Rule>) => {
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      })
      if (res.ok) {
        const data = await res.json()
        setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...data } : r)))
      }
    } catch {
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))
    }
  }, [])

  const deleteRule = useCallback(async (id: string) => {
    try {
      await fetch(`/api/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    } catch {
      // remove locally regardless
    }
    setRules((prev) => prev.filter((r) => r.id !== id))
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  return { rules, loading, addRule, updateRule, deleteRule, fetchRules }
}
