import { create } from "zustand"
import type { ChatMessage, AssistantResponse } from "@/types/chat"
import type { ToolPhaseStatus } from "@/types"

const defaultToolPhase: ToolPhaseStatus = { active: false, phase: "idle", toolCalls: [] }

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  activeMessageId: string | null
  streamingResponse: Partial<AssistantResponse>
  toolPhase: ToolPhaseStatus

  addUserMessage: (content: string) => string
  startStreaming: (messageId: string) => void
  updateStreamingField: (field: keyof AssistantResponse, delta: string) => void
  replaceStreamingField: (field: keyof AssistantResponse, value: unknown) => void
  setToolPhase: (update: Partial<ToolPhaseStatus>) => void
  addToolCall: (call: ToolPhaseStatus["toolCalls"][0]) => void
  updateToolCall: (iteration: number, update: Partial<ToolPhaseStatus["toolCalls"][0]>) => void
  finalizeResponse: (messageId: string, response: AssistantResponse) => void
  stopStreaming: () => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  activeMessageId: null,
  streamingResponse: {},
  toolPhase: { ...defaultToolPhase },

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
      toolPhase: { ...defaultToolPhase },
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

  setToolPhase: (update) => {
    set((state) => ({
      toolPhase: { ...state.toolPhase, ...update },
    }))
  },

  addToolCall: (call) => {
    set((state) => ({
      toolPhase: {
        ...state.toolPhase,
        toolCalls: [...state.toolPhase.toolCalls, call],
      },
    }))
  },

  updateToolCall: (iteration, update) => {
    set((state) => ({
      toolPhase: {
        ...state.toolPhase,
        toolCalls: state.toolPhase.toolCalls.map((tc) =>
          tc.iteration === iteration ? { ...tc, ...update } : tc
        ),
      },
    }))
  },

  finalizeResponse: (messageId, response) => {
    set((state) => ({
      isStreaming: false,
      activeMessageId: null,
      streamingResponse: {},
      toolPhase: { ...defaultToolPhase },
      messages: state.messages.map((m) =>
        m.id === state.activeMessageId ? { ...m, response } : m
      ),
    }))
  },

  stopStreaming: () => {
    set({ isStreaming: false, activeMessageId: null, streamingResponse: {}, toolPhase: { ...defaultToolPhase } })
  },

  clearMessages: () => {
    set({ messages: [], isStreaming: false, activeMessageId: null, streamingResponse: {}, toolPhase: { ...defaultToolPhase } })
  },
}))
