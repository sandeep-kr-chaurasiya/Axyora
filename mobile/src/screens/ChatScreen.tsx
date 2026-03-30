import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  BackHandler,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../hooks/useAuth";
import { MessageBubble } from "../components/MessageBubble";
import { ChatImageGrid } from "../components/ChatImageGrid";
import { ChatHistorySideDrawer } from "../components/ChatHistorySideDrawer";
import { SettingsScreen } from "./SettingsScreen";
import { ProcessingScreen } from "./ProcessingScreen";
import { useChat } from "../hooks/useChat";
import { colors } from "../theme/colors";

export function ChatScreen() {
  const { messages, isLoading, send, clearHistory, loadChat, startNewChat } = useChat();
  const { logout } = useAuth();
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [keyboardActive, setKeyboardActive] = useState(false);

  // Handle Android back button
  useEffect(() => {
    const backAction = () => {
      if (showSettings || showProcessing || showDrawer) {
        return false; // Let modal handle it
      }
      // Keep the app on main screen, don't exit
      return true;
    };

    const backSubscription = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backSubscription.remove();
  }, [showSettings, showProcessing, showDrawer]);

  // Track keyboard state for dynamic padding
  useEffect(() => {
    const timer = setTimeout(() => setKeyboardActive(false), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const latestAssistant = useMemo(
    () => messages.find((msg) => msg.role === "assistant"),
    [messages]
  );

  const submit = useCallback(async () => {
    const value = input.trim();
    if (!value) {
      return;
    }
    setInput("");
    await send(value);
  }, [input, send]);

  const handleLogout = async () => {
    try {
      await clearHistory(); // Clear chat history on logout
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.select({
          ios: 90,
          android: 0,
          default: 0,
        })}
      >
        {/* Header with back button */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.headerLeft}
            onPress={() => setShowDrawer(true)}
            activeOpacity={0.7}
          >
            <Image 
              source={require("../../Axyora transparent .png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.headerTitle}>Axyora</Text>
              <Text style={styles.headerSubtitle}>Your AI Memory</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setShowSettings(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.menuButtonText}>☰</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages FlatList with optimized performance */}
        <FlatList
          style={styles.messages}
          data={messages}
          keyExtractor={(item) => item.id}
          inverted
          scrollEventThrottle={16}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          renderItem={({ item }) => (
            <View style={styles.messageGroup}>
              {/* Image Grid - Always on top when images exist */}
              {item.role === "assistant" && item.images?.length ? (
                <View style={styles.imageSection}>
                  <ChatImageGrid images={item.images} maxImages={6} />
                </View>
              ) : null}

              {/* Message Bubble - Below images */}
              <View style={styles.messageSection}>
                <MessageBubble role={item.role} text={item.text} />
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Image 
                source={require("../../Axyora transparent .png")}
                style={styles.emptyStateIcon}
                resizeMode="contain"
              />
              <Text style={styles.emptyStateTitle}>Start Your Journey</Text>
              <Text style={styles.emptyStateDesc}>
                Ask me anything about your memories, photos, or documents
              </Text>
            </View>
          }
          contentContainerStyle={styles.messagesContent}
          scrollIndicatorInsets={{ right: 1 }}
        />

        {/* Input Row with improved styling */}
        <View style={[styles.inputContainer, keyboardActive && styles.inputContainerActive]}>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, keyboardActive && styles.inputActive]}
              value={input}
              onChangeText={setInput}
              onFocus={() => setKeyboardActive(true)}
              onBlur={() => setKeyboardActive(false)}
              placeholder="Ask Axyora..."
              placeholderTextColor="#687595"
              multiline
              editable={!isLoading}
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.send, isLoading && styles.sendDisabled]}
              onPress={submit}
              disabled={isLoading || !input.trim()}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#06070B" size="small" />
              ) : (
                <Text style={styles.sendText}>↑</Text>
              )}
            </TouchableOpacity>
          </View>
          {input.length > 450 && (
            <Text style={styles.charCount}>{input.length}/500</Text>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Chat History Side Drawer */}
      <ChatHistorySideDrawer
        visible={showDrawer}
        onSelectChat={loadChat}
        onNewChat={startNewChat}
        onClose={() => setShowDrawer(false)}
      />

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowSettings(false)}
      >
        <SettingsScreen
          onReindex={() => {
            setShowSettings(false);
            setShowProcessing(true);
          }}
          onViewIndexing={() => {
            setShowSettings(false);
            setShowProcessing(true);
          }}
          onClearData={async () => {
            // Clear data implementation
            console.log("Clear data");
          }}
          onLogout={handleLogout}
          onClose={() => setShowSettings(false)}
        />
      </Modal>

      {/* Processing Modal */}
      <Modal
        visible={showProcessing}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowProcessing(false)}
      >
        <ProcessingScreen onDone={() => setShowProcessing(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    fontSize: 28,
  },
  logoImage: {
    width: 32,
    height: 32,
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
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuButtonText: {
    fontSize: 20,
    color: colors.text,
  },
  messages: {
    flex: 1,
    paddingHorizontal: 12,
  },
  messagesContent: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    flexGrow: 1,
  },
  messageGroup: {
    marginBottom: 20,
    marginHorizontal: 6,
  },
  imageSection: {
    marginBottom: 12,
  },
  messageSection: {
    marginTop: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  emptyStateDesc: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  inputContainer: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(6,7,11,0.5)",
  },
  inputContainerActive: {
    backgroundColor: "rgba(6,7,11,0.8)",
    paddingBottom: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 100,
    borderColor: "rgba(255,255,255,0.15)",
    borderWidth: 1.5,
    borderRadius: 14,
    color: colors.text,
    backgroundColor: "#111A2A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 20,
  },
  inputActive: {
    borderColor: colors.accent,
    borderWidth: 2,
    backgroundColor: "rgba(17, 26, 42, 0.9)",
  },
  send: {
    height: 48,
    width: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: "#06070B",
    fontWeight: "800",
    fontSize: 22,
  },
  charCount: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    marginLeft: 4,
  },
});
