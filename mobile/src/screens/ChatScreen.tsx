import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
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
import { colors, spacing, borderRadii, shadows, typography } from "../theme";
import { SendIcon } from "../components/Icons";

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
          <Pressable 
            style={styles.headerLeft}
            onPress={() => setShowDrawer(true)}
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
          </Pressable>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.menuButton}
              onPress={() => setShowSettings(true)}
            >
              <SendIcon size={20} color={colors.text} />
            </Pressable>
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
              {/* Message Bubble - First */}
              <View style={styles.messageSection}>
                <MessageBubble role={item.role} text={item.text} />
              </View>

              {/* Image Grid - Below message */}
              {item.role === "assistant" && item.images?.length ? (
                <View style={styles.imageSection}>
                  <ChatImageGrid images={item.images} maxImages={6} />
                </View>
              ) : null}
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
            <Pressable
              style={[styles.send, isLoading && styles.sendDisabled]}
              onPress={submit}
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <SendIcon size={20} color={colors.textInverse} />
              )}
            </Pressable>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(17,17,17,0.7)",
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadii.lg,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  logo: {
    fontSize: 28,
  },
  logoImage: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    ...typography.h4,
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadii.lg,
    backgroundColor: colors.surfaceGlass,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  menuButtonText: {
    fontSize: 20,
    color: colors.text,
    fontWeight: "600",
  },
  messages: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  messagesContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    flexGrow: 1,
  },
  messageGroup: {
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  imageSection: {
    marginBottom: spacing.lg,
  },
  messageSection: {
    marginTop: spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.9,
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    marginBottom: spacing.lg,
  },
  emptyStateTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  emptyStateDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  inputContainer: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "rgba(20,20,20,0.85)",
    borderRadius: 24,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    ...shadows.lg,
  },
  inputContainerActive: {
    backgroundColor: colors.surfaceLight,
    paddingBottom: spacing.xl,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    color: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "transparent",
  },
  inputActive: {
    borderColor: colors.inputFocus,
    borderWidth: 1.5,
    backgroundColor: colors.inputHover,
  },
  send: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#6C63FF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6C63FF",
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 22,
  },
  charCount: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    marginLeft: spacing.md,
  },
});
