import { useState } from "react";

import { queryMemory, type SourceResult, type ImageResult } from "../services/apiClient";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  sources?: SourceResult[];
  images?: ImageResult[];
  fallback?: boolean;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const send = async (input: string, model = "llama3-70b-8192") => {
    const userMessage: ChatMessage = {
      id: `${Date.now()}-u`,
      role: "user",
      text: input,
      createdAt: Date.now(),
    };

    setMessages((prev) => [userMessage, ...prev]);
    setIsLoading(true);

    try {
      const response = await queryMemory({ query: input, model, topK: 5 });
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-a`,
        role: "assistant",
        text: response.answer,
        createdAt: Date.now(),
        sources: response.sources,
        images: response.images,
        fallback: response.fallback,
      };
      setMessages((prev) => [assistantMessage, ...prev]);
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-e`,
        role: "assistant",
        text: `Query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        createdAt: Date.now(),
      };
      setMessages((prev) => [assistantMessage, ...prev]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    send,
  };
}
