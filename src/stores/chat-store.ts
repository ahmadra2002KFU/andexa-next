import { create } from "zustand"
import type { ChatMessage, AssistantResponse } from "@/types/chat"

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  activeMessageId: string | null
  streamingResponse: Partial<AssistantResponse>

  addUserMessage: (content: string) => string
  startStreaming: (messageId: string) => void
  updateStreamingField: (field: keyof AssistantResponse, delta: string) => void
  replaceStreamingField: (field: keyof AssistantResponse, value: unknown) => void
  finalizeResponse: (messageId: string, response: AssistantResponse) => void
  stopStreaming: () => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  activeMessageId: null,
  streamingResponse: {},

  addUserMessage: (content: string) => {
    const id = crypto.randomUUID()
    set((state) => ({
      messages: [
        ...state.messages,
        { id, role: "user", content, timestamp: new Date() },
      ],
    }))
    return id
  },

  startStreaming: (messageId: string) => {
    const assistantId = crypto.randomUUID()
    set((state) => ({
      isStreaming: true,
      activeMessageId: assistantId,
      streamingResponse: {},
      messages: [
        ...state.messages,
        {
          id: assistantId,
          role: "assistant",
          response: { analysis: "", generatedCode: "", commentary: "" },
          timestamp: new Date(),
        },
      ],
    }))
  },

  updateStreamingField: (field, delta) => {
    set((state) => {
      const current = state.streamingResponse
      const prev = (current[field] as string) || ""
      return {
        streamingResponse: { ...current, [field]: prev + delta },
      }
    })
  },

  replaceStreamingField: (field, value) => {
    set((state) => ({
      streamingResponse: { ...state.streamingResponse, [field]: value },
    }))
  },

  finalizeResponse: (messageId, response) => {
    set((state) => ({
      isStreaming: false,
      activeMessageId: null,
      streamingResponse: {},
      messages: state.messages.map((m) =>
        m.id === state.activeMessageId ? { ...m, response } : m
      ),
    }))
  },

  stopStreaming: () => {
    set({ isStreaming: false, activeMessageId: null, streamingResponse: {} })
  },

  clearMessages: () => {
    set({ messages: [], isStreaming: false, activeMessageId: null, streamingResponse: {} })
  },
}))
