import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";

export interface Chat {
  id: string;
  firstMessage: string;
  timestamp: number;
  messageCount: number;
}

export function ChatHistoryScreen(props: {
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  const [chats, setChats] = useState<Chat[]>([]);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      const historyJson = await AsyncStorage.getItem("CHAT_HISTORY");
      if (historyJson) {
        const history = JSON.parse(historyJson);
        // Group messages by chat session and create chat list
        const chatMap = new Map<string, Chat>();
        
        history.forEach((msg: any, index: number) => {
          const chatId = msg.chatId || "default";
          if (!chatMap.has(chatId)) {
            chatMap.set(chatId, {
              id: chatId,
              firstMessage: msg.role === "user" ? msg.text : "AI Response",
              timestamp: msg.timestamp || Date.now(),
              messageCount: 1,
            });
          } else {
            const chat = chatMap.get(chatId)!;
            chat.messageCount += 1;
          }
        });

        const chatList = Array.from(chatMap.values()).sort(
          (a, b) => b.timestamp - a.timestamp
        );
        setChats(chatList);
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
    }
  };

  const deleteChat = async (chatId: string) => {
    Alert.alert("Delete Chat", "Are you sure you want to delete this chat?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const historyJson = await AsyncStorage.getItem("CHAT_HISTORY");
            if (historyJson) {
              const history = JSON.parse(historyJson);
              const filtered = history.filter(
                (msg: any) => (msg.chatId || "default") !== chatId
              );
              await AsyncStorage.setItem(
                "CHAT_HISTORY",
                JSON.stringify(filtered)
              );
              loadChats();
            }
          } catch (error) {
            console.error("Failed to delete chat:", error);
          }
        },
      },
    ]);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const renderChatItem = ({ item }: { item: Chat }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => {
        props.onSelectChat(item.id);
        props.onClose();
      }}
      onLongPress={() => deleteChat(item.id)}
      delayLongPress={500}
    >
      <View style={styles.chatContent}>
        <Text style={styles.chatTitle} numberOfLines={1}>
          {item.firstMessage}
        </Text>
        <Text style={styles.chatMeta}>
          {item.messageCount} messages • {formatDate(item.timestamp)}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Image
            source={require("../../Axyora transparent .png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.headerTitle}>Chat History</Text>
            <Text style={styles.headerSubtitle}>
              {chats.length} conversation{chats.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={props.onClose}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Chat List or Empty State */}
      {chats.length > 0 ? (
        <FlatList
          data={chats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollIndicatorInsets={{ right: 1 }}
        />
      ) : (
        <View style={styles.emptyState}>
          <Image
            source={require("../../Axyora transparent .png")}
            style={styles.emptyIcon}
            resizeMode="contain"
          />
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptyDesc}>
            Start a conversation to see your chat history
          </Text>
        </View>
      )}

      {/* New Chat Button */}
      <TouchableOpacity
        style={styles.newChatBtn}
        onPress={() => {
          props.onNewChat();
          props.onClose();
        }}
      >
        <Text style={styles.newChatBtnText}>+ New Chat</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  closeBtn: {
    fontSize: 24,
    color: colors.text,
    padding: 8,
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  chatItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 8,
    marginVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatContent: {
    flex: 1,
    marginRight: 12,
  },
  chatTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  chatMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDesc: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  newChatBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "rgba(6,200,100,0.2)",
    borderWidth: 1,
    borderColor: "rgba(6,200,100,0.4)",
    alignItems: "center",
  },
  newChatBtnText: {
    color: "#06C864",
    fontSize: 16,
    fontWeight: "600",
  },
});
