import { useMemo, useState } from "react";
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
} from "react-native";

import { MessageBubble } from "../components/MessageBubble";
import { EnhancedSearchResultCard } from "../components/EnhancedSearchResultCard";
import { ImageResultCard } from "../components/ImageResultCard";
import { useChat } from "../hooks/useChat";
import { colors } from "../theme/colors";

export function ChatScreen() {
  const { messages, isLoading, send } = useChat();
  const [input, setInput] = useState("");

  const latestAssistant = useMemo(() => messages.find((msg) => msg.role === "assistant"), [messages]);

  const submit = async () => {
    const value = input.trim();
    if (!value) {
      return;
    }
    setInput("");
    await send(value);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={22}
    >
      <Text style={styles.title}>Axyora Chat</Text>
      <Text style={styles.subtitle}>Ask anything from your indexed private memory</Text>

      <FlatList
        style={styles.messages}
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        renderItem={({ item }) => <MessageBubble role={item.role} text={item.text} />}
      />

      {latestAssistant?.images?.length ? (
        <View style={styles.imagesWrap}>
          <Text style={styles.resultsTitle}>Images found</Text>
          <FlatList
            data={latestAssistant.images}
            keyExtractor={(item, idx) => `${item.file_name}-${idx}`}
            renderItem={({ item }) => <ImageResultCard image={item} query={input} />}
            style={{ maxHeight: 300 }}
          />
        </View>
      ) : null}

      {latestAssistant?.sources?.length ? (
        <View style={styles.sourcesWrap}>
          <Text style={styles.resultsTitle}>Top sources</Text>
          <FlatList
            data={latestAssistant.sources}
            keyExtractor={(item, idx) => `${item.path}-${idx}`}
            renderItem={({ item }) => <EnhancedSearchResultCard source={item} query={input} />}
            style={{ maxHeight: 180 }}
          />
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask your memory..."
          placeholderTextColor="#687595"
          multiline
        />
        <TouchableOpacity style={styles.send} onPress={submit} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#072117" /> : <Text style={styles.sendText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 56,
    paddingHorizontal: 14,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 10,
  },
  messages: {
    flex: 1,
  },
  imagesWrap: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
    marginBottom: 8,
    maxHeight: 350,
  },
  sourcesWrap: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
    marginBottom: 8,
  },
  resultsTitle: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 8,
    fontSize: 13,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    color: colors.text,
    backgroundColor: "#111A2A",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: {
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: {
    color: "#072117",
    fontWeight: "800",
  },
});
