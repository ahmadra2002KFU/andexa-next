"use client"

import { useSidebar } from "@/hooks/use-sidebar"
import { useChatStore } from "@/stores/chat-store"
import { useSettingsStore } from "@/stores/settings-store"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus } from "lucide-react"
import { FileInfo } from "./file-info"
import { FileManager } from "./file-manager"
import { RulesSection } from "./rules-section"
import { RecentChats } from "./recent-chats"
import { ProviderSelect } from "./provider-select"
import { useTheme } from "next-themes"

export function Sidebar() {
  const { sidebarOpen, sidebarWidth } = useSidebar()
  const clearMessages = useChatStore((s) => s.clearMessages)
  const { analysisMode, setAnalysisMode, autoExpandCode, setAutoExpandCode, showExecutionTime, setShowExecutionTime } = useSettingsStore()
  const { theme, setTheme } = useTheme()

  return (
    <aside
      className={`flex h-full flex-col border-r bg-card transition-all duration-300 ${
        sidebarOpen ? "" : "-translate-x-full absolute"
      }`}
      style={{ width: sidebarOpen ? sidebarWidth : 0 }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          A
        </div>
        <span className="font-semibold">Andexa</span>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-3 py-2">
          <FileInfo />
          <Separator />
          <FileManager />
          <Separator />
          <RulesSection />
          <Separator />
          <RecentChats />
          <Separator />

          {/* Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Settings</h3>

            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Analysis Mode</h4>
              <Select value={analysisMode} onValueChange={(v) => setAnalysisMode(v as "normal" | "jci")}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal Analysis</SelectItem>
                  <SelectItem value="jci">JCI Standards</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ProviderSelect />

            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Theme</h4>
              <div className="flex items-center justify-between text-xs">
                <span>Dark Mode</span>
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Display</h4>
              <div className="flex items-center justify-between text-xs">
                <span>Auto-expand code</span>
                <Switch checked={autoExpandCode} onCheckedChange={setAutoExpandCode} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Show execution time</span>
                <Switch checked={showExecutionTime} onCheckedChange={setShowExecutionTime} />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* New Chat */}
      <div className="border-t p-4">
        <Button className="w-full" onClick={clearMessages}>
          <Plus className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>
    </aside>
  )
}
