import { useState, useEffect, useCallback } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../hooks/useAuth";
import { ChatImageGrid } from "../components/ChatImageGrid";
import { ChatHistorySideDrawer } from "../components/ChatHistorySideDrawer";
import { TypingIndicator } from "../components/LoadingIndicators";
import { SettingsScreen } from "./SettingsScreen";
import { ProcessingScreen } from "./ProcessingScreen";
import { useChat } from "../hooks/useChat";
import { SendIcon } from "../components/Icons";
import { colors } from "../theme/colors";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const ACCENT        = colors.accent;
const ACCENT_DIM    = colors.accentLight;
const BG            = colors.background;
const BG_SURFACE    = colors.surface;
const BG_GLASS      = colors.surfaceGlass;
const BORDER        = colors.border;
const BORDER_SOFT   = colors.borderLight;
const TEXT_PRIMARY  = colors.textPrimary;
const TEXT_2        = colors.textSecondary;
const TEXT_3        = colors.textMuted;
const BUBBLE_USER         = colors.accent;
const BUBBLE_USER_BORDER  = "rgba(16,185,129,0.35)";
const BUBBLE_ASST         = colors.card;
const MONO = Platform.select({ ios: "Menlo", android: "monospace" });

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActiveDot() {
  return (
    <View style={s.activeDotOuter}>
      <View style={s.activeDotInner} />
    </View>
  );
}

function LatencyBadge({ ms }: { ms: number }) {
  return (
    <View style={s.latencyBadge}>
      <View style={s.latencyDot} />
      <Text style={s.latencyText}>{ms}ms</Text>
    </View>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <View style={s.dateDivider}>
      <View style={s.dateLine} />
      <View style={s.datePill}>
        <Text style={s.datePillText}>{label}</Text>
      </View>
      <View style={s.dateLine} />
    </View>
  );
}

/**
 * Inline Bubble — replaces the external <MessageBubble> to fix the
 * green user-bubble issue caused by the app theme's accent color leaking in.
 */
function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const isUser = role === "user";
  return (
    <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAsst]}>
      <Text style={[s.bubbleText, isUser ? s.bubbleTextUser : s.bubbleTextAsst]}>
        {text}
      </Text>
    </View>
  );
}

function countDisplayImages(images?: { file_name: string; image_uri?: string }[]) {
  if (!images || images.length === 0) return 0;
  return images.filter((img) => {
    const name = img.file_name?.toLowerCase() || "";
    if (name.endsWith(".heic")) return false;
    return Boolean(img.image_uri);
  }).length;
}

function AssistantAvatar() {
  return (
    <View style={s.avatar}>
      <Image
        source={require("../../Axyora transparent .png")}
        style={s.avatarImg}
        resizeMode="contain"
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function ChatScreen() {
  const { messages, isLoading, send, clearHistory, loadChat, startNewChat } = useChat();
  const { logout } = useAuth();
  const [input, setInput]                   = useState("");
  const [showSettings, setShowSettings]     = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [showDrawer, setShowDrawer]         = useState(false);
  const [inputFocused, setInputFocused]     = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showSettings || showProcessing || showDrawer) return false;
      return true;
    });
    return () => sub.remove();
  }, [showSettings, showProcessing, showDrawer]);

  const submit = useCallback(async () => {
    const v = input.trim();
    if (!v) return;
    setInput("");
    await send(v);
  }, [input, send]);

  const handleLogout = async () => {
    try {
      await clearHistory();
      await logout();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  // Reserve enough room for the floating dock so bottom content never sits under it.
  const dockBottom = Math.max(insets.bottom + 12, 18);
  const dockHeightEstimate = 104;
  const listBottomPad = dockBottom + dockHeightEstimate + 24;
  const headerClearance = dockHeightEstimate + 16;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.select({
          ios: insets.top + 90,
          android: insets.top + 20,
          default: 0,
        })}
      >

        {/* ── HEADER ───────────────────────────────────────────────────── */}
        <View style={s.header}>
          <Pressable style={s.headerLeft} onPress={() => setShowDrawer(true)}>
            <View style={s.logoTile}>
              <Image
                source={require("../../Axyora transparent .png")}
                style={s.logoImg}
                resizeMode="contain"
              />
            </View>
            <View>
              <Text style={s.appName}>Axyora</Text>
              <View style={s.subtitleRow}>
                <ActiveDot />
                <Text style={s.appSub}>AI Memory · Active</Text>
              </View>
            </View>
          </Pressable>

          <View style={s.headerRight}>
            <Pressable style={s.iconBtn} onPress={() => setShowSettings(true)}>
              <View style={s.burgerWrap}>
                <View style={s.burgerLine} />
                <View style={[s.burgerLine, { width: 11 }]} />
                <View style={[s.burgerLine, { width: 14 }]} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── MESSAGE LIST ──────────────────────────────────────────────── */}
        <FlatList
          style={s.list}
          data={messages}
          keyExtractor={(item) => item.id}
          inverted
          scrollEventThrottle={16}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          contentContainerStyle={[s.listContent, { paddingBottom: listBottomPad }]}
          ListHeaderComponentStyle={{ paddingBottom: headerClearance }}
          scrollIndicatorInsets={{ right: 1 }}

          // Rendered at visual BOTTOM (list is inverted)
          ListHeaderComponent={
            <View style={s.extras}>
              {isLoading && (
                <View style={s.typingRow}>
                  <AssistantAvatar />
                  <View style={s.typingBubble}>
                    <TypingIndicator color={ACCENT} />
                  </View>
                </View>
              )}
            </View>
          }

          // Rendered at visual TOP (list is inverted)
          ListFooterComponent={<DateDivider label="Today" />}

          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyLogoTile}>
                <Image
                  source={require("../../Axyora transparent .png")}
                  style={s.emptyLogoImg}
                  resizeMode="contain"
                />
              </View>
              <Text style={s.emptyTitle}>Start Your Journey</Text>
              <Text style={s.emptyDesc}>
                Ask me anything about your memories, photos, or documents
              </Text>
              <View style={s.emptyBadge}>
                <View style={s.emptyBadgeDot} />
                <Text style={s.emptyBadgeText}>End-to-end encrypted · Stored locally</Text>
              </View>
            </View>
          }

          renderItem={({ item }) => {
            const isUser = item.role === "user";
            const time   = new Date(item.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const latencyMs = typeof item.durationMs === "number" ? item.durationMs : null;
            const displayImageCount = countDisplayImages(item.images);

            return (
              <View style={s.msgGroup}>
                <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAsst]}>

                  {/* Avatar — assistant side only */}
                  {!isUser && <AssistantAvatar />}

                  {/* Bubble + extras column */}
                  <View style={[s.msgContent, isUser && s.msgContentUser]}>
                    <Bubble role={item.role} text={item.text} />

                    {/* Image grid */}
                    {!isUser && displayImageCount > 0 && (
                      <View style={s.imageCard}>
                        <ChatImageGrid images={item.images ?? []} maxImages={6} />
                      </View>
                    )}

                    {/* Result count */}
                    {!isUser && displayImageCount > 0 && (
                      <View style={s.resultRow}>
                        <View style={s.resultLine} />
                        <Text style={s.resultText}>
                          {displayImageCount} results · matched memories
                        </Text>
                      </View>
                    )}

                    {/* Timestamp + latency */}
                    <View style={[s.metaRow, isUser && s.metaRowUser]}>
                      <Text style={s.metaTime}>{time}</Text>
                      {!isUser && latencyMs !== null && (
                        <LatencyBadge ms={Math.max(60, Math.round(latencyMs))} />
                      )}
                    </View>
                  </View>
                </View>
              </View>
            );
          }}
        />

        {/* ── FLOATING INPUT DOCK ───────────────────────────────────────── */}
        <View
          style={[
            s.dock,
            inputFocused && s.dockFocused,
            { bottom: dockBottom },
          ]}
        >
          <View style={s.inputRow}>
            {/* Attach button */}
            <Pressable style={s.attachBtn}>
              <View style={s.attachIconOuter}>
                <View style={s.attachIconInner} />
              </View>
            </Pressable>

            <TextInput
              style={s.textInput}
              value={input}
              onChangeText={setInput}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Ask Axyora anything..."
              placeholderTextColor={TEXT_3}
              multiline
              editable={!isLoading}
              maxLength={500}
            />

            <Pressable
              style={[s.sendBtn, (!input.trim() || isLoading) && s.sendBtnOff]}
              onPress={submit}
              disabled={isLoading || !input.trim()}
            >
              {isLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <SendIcon size={15} color="#fff" />
              }
            </Pressable>
          </View>

          {input.length > 450 && (
            <Text style={s.charCount}>{input.length}/500</Text>
          )}

          <Text style={s.privacyHint}>End-to-end encrypted · Stored locally</Text>
        </View>
      </KeyboardAvoidingView>

      {/* ── DRAWERS & MODALS ─────────────────────────────────────────────── */}
      <ChatHistorySideDrawer
        visible={showDrawer}
        onSelectChat={loadChat}
        onNewChat={startNewChat}
        onClose={() => setShowDrawer(false)}
      />

      <Modal
        visible={showSettings}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowSettings(false)}
      >
        <SettingsScreen
          onReindex={() => { setShowSettings(false); setShowProcessing(true); }}
          onViewIndexing={() => { setShowSettings(false); setShowProcessing(true); }}
          onClearData={async () => console.log("Clear data")}
          onLogout={handleLogout}
          onClose={() => setShowSettings(false)}
        />
      </Modal>

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

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  // layout
  safe: { flex: 1, backgroundColor: BG },
  root: { flex: 1, backgroundColor: BG },

  // ── header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: "#000000",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: ACCENT,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  logoImg: { width: 24, height: 24 },
  appName: { fontSize: 15, fontWeight: "700", color: TEXT_PRIMARY, letterSpacing: -0.3 },
  subtitleRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  activeDotOuter: {
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: "rgba(52,211,153,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  activeDotInner: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#34D399" },
  appSub: { fontSize: 11, color: TEXT_3 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: colors.cardGlass, borderWidth: 0.5, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
  },
  burgerWrap: { gap: 3.5, alignItems: "flex-end" },
  burgerLine: { width: 14, height: 1.5, borderRadius: 1, backgroundColor: TEXT_2 },

  // ── list
  list: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 16, flexGrow: 1 },

  // ── list header/footer
  extras: { gap: 10, marginBottom: 8 },

  // ── typing
  typingRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 4 },
  typingBubble: {
    backgroundColor: BG_SURFACE,
    borderRadius: 16, borderTopLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 0.5, borderColor: BORDER,
  },

  // ── suggestions
  suggestSection: { gap: 7 },
  suggestLabel: { fontSize: 9, color: TEXT_3, letterSpacing: 0.9, fontFamily: MONO, paddingLeft: 2 },

  // ── date divider
  dateDivider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  dateLine: { flex: 1, height: 0.5, backgroundColor: BORDER },
  datePill: {
    paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: BG_GLASS, borderWidth: 0.5, borderColor: BORDER, borderRadius: 20,
  },
  datePillText: { fontSize: 10, color: TEXT_3, fontFamily: MONO, letterSpacing: 0.3 },

  // ── message group + row
  msgGroup: { marginBottom: 14 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAsst: { justifyContent: "flex-start" },
  msgContent: { maxWidth: "74%", gap: 5 },
  msgContentUser: { alignItems: "flex-end" },

  // ── avatar
  avatar: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.primaryDark,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    shadowColor: ACCENT, shadowOpacity: 0.3, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  avatarImg: { width: 18, height: 18 },

  // ── bubbles — hardcoded colors, no theme inheritance
  bubble: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 18 },
  bubbleUser: {
    backgroundColor: BUBBLE_USER,       // accent bubble to match theme
    borderWidth: 0.5,
    borderColor: BUBBLE_USER_BORDER,
    borderTopRightRadius: 4,
  },
  bubbleAsst: {
    backgroundColor: BUBBLE_ASST,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderTopLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 21, letterSpacing: -0.1 },
  bubbleTextUser: { color: colors.textInverse },
  bubbleTextAsst: { color: TEXT_PRIMARY },

  // ── image card
  imageCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 16, padding: 5,
    borderWidth: 0.5, borderColor: BORDER, marginTop: 3,
  },

  // ── result count
  resultRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  resultLine: { width: 14, height: 0.5, backgroundColor: BORDER_SOFT },
  resultText: { fontSize: 10, color: TEXT_3, fontFamily: MONO, letterSpacing: 0.2 },

  // ── meta
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, paddingLeft: 2 },
  metaRowUser: { justifyContent: "flex-end", paddingLeft: 0, paddingRight: 2 },
  metaTime: { fontSize: 10, color: TEXT_3, fontFamily: MONO },
  latencyBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: ACCENT_DIM,
    borderWidth: 0.5, borderColor: "rgba(108,106,246,0.22)", borderRadius: 20,
  },
  latencyDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT },
  latencyText: { fontSize: 9, color: colors.primaryLight, fontFamily: MONO },

  // ── empty state
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyLogoTile: {
    width: 68, height: 68, borderRadius: 20, backgroundColor: colors.primaryDark,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
    shadowColor: ACCENT, shadowOpacity: 0.5, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  emptyLogoImg: { width: 42, height: 42 },
  emptyTitle: {
    fontSize: 22, fontWeight: "700", color: TEXT_PRIMARY,
    marginBottom: 10, textAlign: "center", letterSpacing: -0.4,
  },
  emptyDesc: { fontSize: 14, color: TEXT_2, textAlign: "center", lineHeight: 22, marginBottom: 22 },
  emptyBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: BG_GLASS, borderWidth: 0.5, borderColor: BORDER, borderRadius: 20,
  },
  emptyBadgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#34D399" },
  emptyBadgeText: { fontSize: 11, color: TEXT_3, fontFamily: MONO },

  // ── dock
  dock: {
    position: "absolute",
    left: 12, right: 12,
    backgroundColor: colors.cardGlass,
    borderRadius: 24,
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12,
    borderWidth: 0.5, borderColor: BORDER_SOFT,
    shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 }, elevation: 20,
    gap: 6,
  },
  dockFocused: {
    borderColor: "rgba(16,185,129,0.45)",
    backgroundColor: colors.surfaceOverlay,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  attachBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: BG_GLASS, borderWidth: 0.5, borderColor: BORDER,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  attachIconOuter: {
    width: 14, height: 14, alignItems: "center",
    justifyContent: "center", transform: [{ rotate: "45deg" }],
  },
  attachIconInner: { width: 11, height: 11, borderWidth: 1.5, borderColor: TEXT_2, borderRadius: 3 },
  textInput: {
    flex: 1, minHeight: 34, maxHeight: 100,
    color: TEXT_PRIMARY,
    paddingHorizontal: 6, paddingVertical: 6,
    fontSize: 14, backgroundColor: "transparent",
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
    shadowColor: ACCENT, shadowOpacity: 0.55, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 8,
  },
  sendBtnOff: { opacity: 0.35, shadowOpacity: 0, elevation: 0 },
  charCount: { fontSize: 10, color: TEXT_3, textAlign: "right", fontFamily: MONO, paddingRight: 4 },
  privacyHint: { fontSize: 10, color: TEXT_3, textAlign: "center", fontFamily: MONO, letterSpacing: 0.2, paddingBottom: 0 },
});
