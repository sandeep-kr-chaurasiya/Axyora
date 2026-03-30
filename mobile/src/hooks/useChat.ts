import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { queryMemory, type SourceResult, type ImageResult } from "../services/apiClient";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  sources?: SourceResult[];
  images?: ImageResult[];
  fallback?: boolean;
  chatId?: string;
}

const CHAT_HISTORY_KEY = "@axyora/chat-history";
const CURRENT_CHAT_ID_KEY = "@axyora/current-chat-id";
const MAX_HISTORY_MESSAGES = 100;

const GREETINGS = [
  "Hey! 👋",
  "Hi there! 👋",
  "Hello! 😊",
  "Hey! 🧠",
];

const GREETING_RESPONSES = {
  answer: (greeting: string) =>
    `${greeting} I'm here to help you search through your memories. What would you like to find?`,
  noResults: (greeting: string) =>
    `${greeting} I searched but didn't find anything matching that. Try asking differently or with more specific keywords.`,
  imageSearch: (count: number) =>
    `${GREETINGS[Math.floor(Math.random() * GREETINGS.length)]} Found ${count} image${count !== 1 ? "s" : ""} for you! 📸`,
  textSearch: (preview: string) =>
    `${GREETINGS[Math.floor(Math.random() * GREETINGS.length)]} I found this in your memory:\n\n${preview}`,
};

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string>("");

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const chatIdStored = await AsyncStorage.getItem(CURRENT_CHAT_ID_KEY);
        const stored = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
        
        const chatId = chatIdStored || `chat-${Date.now()}`;
        setCurrentChatId(chatId);

        if (stored) {
          const parsed = JSON.parse(stored) as ChatMessage[];
          // Filter to only messages from current chat
          const currentChatMessages = parsed
            .filter((msg) => msg.chatId === chatId)
            .slice(0, MAX_HISTORY_MESSAGES);
          setMessages(currentChatMessages);
        }

        // If new chat, save the ID
        if (!chatIdStored) {
          await AsyncStorage.setItem(CURRENT_CHAT_ID_KEY, chatId);
        }
      } catch (error) {
        console.error("[Chat] Failed to load history:", error);
        setCurrentChatId(`chat-${Date.now()}`);
      } finally {
        setHistoryLoaded(true);
      }
    };
    loadHistory();
  }, []);

  // Save chat history whenever messages change
  useEffect(() => {
    if (historyLoaded && messages.length > 0 && currentChatId) {
      const saveLater = async () => {
        try {
          const stored = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
          const allMessages = stored ? JSON.parse(stored) : [];
          
          // Remove old messages from this chat
          const filtered = allMessages.filter(
            (msg: ChatMessage) => msg.chatId !== currentChatId
          );
          
          // Add current chat messages
          const updated = [...filtered, ...messages].slice(
            0,
            MAX_HISTORY_MESSAGES * 10
          );
          
          await AsyncStorage.setItem(
            CHAT_HISTORY_KEY,
            JSON.stringify(updated)
          );
        } catch (error) {
          console.error("[Chat] Failed to save history:", error);
        }
      };
      
      saveLater();
    }
  }, [messages, historyLoaded, currentChatId]);

  const send = async (input: string, model = "llama-3.3-70b-versatile") => {
    const userMessage: ChatMessage = {
      id: `${Date.now()}-u`,
      role: "user",
      text: input,
      createdAt: Date.now(),
      chatId: currentChatId,
    };

    setMessages((prev) => [userMessage, ...prev]);
    setIsLoading(true);

    try {
      console.log(`[Chat] Sending query: "${input}"`);
      console.log(`[Chat] Using model: ${model}`);
      
      const response = await queryMemory({ query: input, model, topK: 5 });
      
      console.log(`[Chat] Response received from API`);
      console.log(`[Chat] Response answer: ${response.answer?.substring(0, 100) || "N/A"}`);
      console.log(`[Chat] Response images count: ${response.images?.length || 0}`);
      console.log(`[Chat] Response sources count: ${response.sources?.length || 0}`);
      
      if (response.images && response.images.length > 0) {
        console.log(`[Chat] Images received:`);
        response.images.forEach((img, idx) => {
          console.log(`  Image ${idx}: ${img.file_name}`);
          console.log(`    Path: ${img.file_path}`);
          console.log(`    URI: ${img.image_uri}`);
        });
      }
      
      // Generate friendly assistant response with context
      let answerText = response.answer;
      if (!answerText || answerText.includes("no memory")) {
        answerText = GREETING_RESPONSES.noResults(
          GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
        );
      } else if (response.images?.length && !response.sources?.length) {
        // Only images found
        console.log(`[Chat] Images found without sources`);
        answerText = GREETING_RESPONSES.imageSearch(response.images.length);
      } else if (response.images?.length && response.sources?.length) {
        // Both found - prepend greeting
        const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        answerText = `${greeting} ${response.answer}`;
      }

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-a`,
        role: "assistant",
        text: answerText,
        createdAt: Date.now(),
        sources: response.sources,
        images: response.images,
        fallback: response.fallback,
        chatId: currentChatId,
      };
      console.log(`[Chat] Adding assistant message with ${response.images?.length || 0} images`);
      setMessages((prev) => [assistantMessage, ...prev]);
    } catch (error) {
      console.error(`[Chat] Error during query:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-e`,
        role: "assistant",
        text: `Oops! 😅 Something went wrong: ${errorMessage}. Please try again.`,
        createdAt: Date.now(),
        chatId: currentChatId,
      };
      setMessages((prev) => [assistantMessage, ...prev]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    try {
      await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
      await AsyncStorage.removeItem(CURRENT_CHAT_ID_KEY);
      setMessages([]);
      const newChatId = `chat-${Date.now()}`;
      setCurrentChatId(newChatId);
      await AsyncStorage.setItem(CURRENT_CHAT_ID_KEY, newChatId);
    } catch (error) {
      console.error("[Chat] Failed to clear history:", error);
    }
  };

  const loadChat = async (chatId: string) => {
    try {
      const stored = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        const chatMessages = parsed
          .filter((msg) => msg.chatId === chatId)
          .slice(0, MAX_HISTORY_MESSAGES);
        setMessages(chatMessages);
        setCurrentChatId(chatId);
        await AsyncStorage.setItem(CURRENT_CHAT_ID_KEY, chatId);
      }
    } catch (error) {
      console.error("[Chat] Failed to load chat:", error);
    }
  };

  const startNewChat = async () => {
    const newChatId = `chat-${Date.now()}`;
    setCurrentChatId(newChatId);
    setMessages([]);
    await AsyncStorage.setItem(CURRENT_CHAT_ID_KEY, newChatId);
  };

  return {
    messages,
    isLoading,
    send,
    clearHistory,
    historyLoaded,
    currentChatId,
    loadChat,
    startNewChat,
  };
}
