"use client"

import { useSidebar } from "@/hooks/use-sidebar"
import { Sidebar } from "@/components/sidebar/sidebar"
import { ChatContainer } from "@/components/chat/chat-container"
import { UploadProgress } from "@/components/indicators/upload-progress"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Menu, LogOut } from "lucide-react"
import { signOut } from "next-auth/react"
import { useFileStore } from "@/stores/file-store"

interface AppShellProps {
  userName: string
}

export function AppShell({ userName }: AppShellProps) {
  const { sidebarOpen, toggleSidebar } = useSidebar()
  const uploading = useFileStore((s) => s.uploading)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b px-4 py-3">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} title="Toggle sidebar (Ctrl+B)">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            <span className="text-sm font-medium">Connected</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">{userName[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{userName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Upload Progress */}
        {uploading && (
          <div className="px-4 py-2">
            <UploadProgress />
          </div>
        )}

        {/* Chat */}
        <ChatContainer />
      </main>
    </div>
  )
}
