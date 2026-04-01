import React, { useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Animated,
  Dimensions,
  GestureResponderEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";
import { CloseIcon } from "./Icons";

export interface Chat {
  id: string;
  firstMessage: string;
  timestamp: number;
  messageCount: number;
}

const DRAWER_WIDTH = Dimensions.get("window").width * 0.75;

export function ChatHistorySideDrawer(props: {
  visible: boolean;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}) {
  const [chats, setChats] = React.useState<Chat[]>([]);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // Animate drawer in/out
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: props.visible ? 0 : -DRAWER_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [props.visible, slideAnim]);

  useEffect(() => {
    if (props.visible) {
      loadChats();
    }
  }, [props.visible]);

  const loadChats = async () => {
    try {
      const historyJson = await AsyncStorage.getItem("CHAT_HISTORY");
      if (historyJson) {
        const history = JSON.parse(historyJson);
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

  const handleChatSelect = (chatId: string) => {
    props.onSelectChat(chatId);
    props.onClose();
  };

  const handleNewChat = () => {
    props.onNewChat();
    props.onClose();
  };

  const renderChatItem = ({ item }: { item: Chat }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => handleChatSelect(item.id)}
      onLongPress={() => deleteChat(item.id)}
      delayLongPress={500}
    >
      <View style={styles.chatContent}>
        <Text style={styles.chatTitle} numberOfLines={1}>
          {item.firstMessage}
        </Text>
        <Text style={styles.chatMeta}>
          {item.messageCount} msgs • {formatDate(item.timestamp)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (!props.visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Overlay backdrop */}
      <TouchableOpacity
        style={styles.overlay}
        onPress={props.onClose}
        activeOpacity={1}
      />

      {/* Side Drawer */}
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <SafeAreaView style={styles.drawerContent}>
          {/* Header */}
          <View style={styles.drawerHeader}>
            <Image
              source={require("../../Axyora transparent .png")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Chat History</Text>
              <Text style={styles.headerSubtitle}>
                {chats.length} conversation{chats.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={props.onClose} style={styles.closeBtn}>
              <CloseIcon size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Chat List */}
          {chats.length > 0 ? (
            <FlatList
              data={chats}
              renderItem={renderChatItem}
              keyExtractor={(item) => item.id}
              scrollIndicatorInsets={{ right: 1 }}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyDesc}>
                Start a conversation to see your chat history
              </Text>
            </View>
          )}

          {/* New Chat Button */}
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={handleNewChat}
          >
            <Text style={styles.newChatBtnText}>+ New Chat</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.background,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.1)",
  },
  drawerContent: {
    flex: 1,
    paddingHorizontal: 12,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
    gap: 8,
  },
  headerLogo: {
    width: 32,
    height: 32,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtnText: {
    fontSize: 20,
    color: colors.text,
  },
  listContent: {
    paddingBottom: 12,
  },
  chatItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chatContent: {
    flex: 1,
  },
  chatTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 3,
  },
  chatMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDesc: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  newChatBtn: {
    marginVertical: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "rgba(6,200,100,0.2)",
    borderWidth: 1,
    borderColor: "rgba(6,200,100,0.4)",
    alignItems: "center",
  },
  newChatBtnText: {
    color: "#06C864",
    fontSize: 14,
    fontWeight: "600",
  },
});
