"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { useChat } from "@/hooks/use-chat"
import { WelcomeScreen } from "./welcome-screen"
import { Message } from "./message"
import { ChatInput } from "./chat-input"

export function ChatContainer() {
  const { messages, isStreaming, streamingResponse, activeMessageId, toolPhase, sendMessage } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [exampleText, setExampleText] = useState("")

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingResponse])

  const handleExampleClick = useCallback((text: string) => {
    setExampleText(text)
    sendMessage(text)
    setExampleText("")
  }, [sendMessage])

  const handleSend = useCallback(
    (text: string) => {
      setExampleText("")
      sendMessage(text)
    },
    [sendMessage]
  )

  const hasMessages = messages.length > 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!hasMessages ? (
        <WelcomeScreen onExampleClick={handleExampleClick} />
      ) : (
        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          <div className="mx-auto max-w-4xl px-4 py-4">
            {messages.map((msg) => (
              <Message
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && msg.id === activeMessageId}
                streamingResponse={
                  msg.id === activeMessageId ? streamingResponse : undefined
                }
                toolPhase={msg.id === activeMessageId ? toolPhase : undefined}
              />
            ))}
          </div>
        </div>
      )}
      <ChatInput onSend={handleSend} disabled={isStreaming} defaultValue={exampleText} />
    </div>
  )
}
