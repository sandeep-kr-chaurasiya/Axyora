import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme/colors";

export function EnhancedOnboardingScreen(props: { onComplete: () => void }) {
  return (
    <LinearGradient colors={["#06070B", "#0D1428", "#071A25"]} style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* Header */}
        <View style={styles.hero}>
          <Text style={styles.title}>Your device. Your memory.</Text>
          <Text style={styles.subtitle}>
            Axyora is a private AI memory engine that runs 100% locally on your device.
          </Text>
        </View>

        {/* Privacy Promise */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔒 Privacy First</Text>
          <Text style={styles.sectionText}>
            All your files, documents, images, and audio stay on your device. Nothing is uploaded to the cloud.
          </Text>
          <Text style={styles.sectionText}>
            Your AI model runs locally. Your searches stay private. Complete data ownership.
          </Text>
        </View>

        {/* What We Access */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📂 What We'll Access</Text>
          
          <View style={styles.permissionItem}>
            <Text style={styles.permissionIcon}>🖼️</Text>
            <View style={styles.permissionContent}>
              <Text style={styles.permissionName}>Photo Library</Text>
              <Text style={styles.permissionDesc}>Read all images to extract text and build memory index</Text>
            </View>
          </View>

          <View style={styles.permissionItem}>
            <Text style={styles.permissionIcon}>📄</Text>
            <View style={styles.permissionContent}>
              <Text style={styles.permissionName}>Documents & Files</Text>
              <Text style={styles.permissionDesc}>Access PDFs, Word docs, and text files for indexing</Text>
            </View>
          </View>

          <View style={styles.permissionItem}>
            <Text style={styles.permissionIcon}>🎵</Text>
            <View style={styles.permissionContent}>
              <Text style={styles.permissionName}>Audio Files</Text>
              <Text style={styles.permissionDesc}>Transcribe voice memos and audio using on-device speech-to-text</Text>
            </View>
          </View>
        </View>

        {/* Data Processing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚙️ How It Works</Text>
          
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Grant Permissions</Text>
              <Text style={styles.stepDesc}>Allow access to your media library and documents</Text>
            </View>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Auto-Scan Storage</Text>
              <Text style={styles.stepDesc}>App automatically discovers all images, audio, and documents</Text>
            </View>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Extract & Index</Text>
              <Text style={styles.stepDesc}>Text is extracted from files and converted to AI embeddings</Text>
            </View>
          </View>

          <View style={styles.step}>
            <Text style={styles.stepNumber}>4</Text>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Ask & Discover</Text>
              <Text style={styles.stepDesc}>Ask questions and get answers with sources from your indexed memory</Text>
            </View>
          </View>
        </View>

        {/* What You'll See */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔍 Query Results Include</Text>
          
          <View style={styles.featureItem}>
            <Text style={styles.featureLabel}>📸 Image Previews</Text>
            <Text style={styles.featureDesc}>Thumbnail of source images in search results</Text>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureLabel}>📍 File Location</Text>
            <Text style={styles.featureDesc}>Exact path where the file was found on your device</Text>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureLabel}>ℹ️ Full Metadata</Text>
            <Text style={styles.featureDesc}>File type, size, date modified, and relevance score</Text>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureLabel}>📊 Text Preview</Text>
            <Text style={styles.featureDesc}>Highlighted snippets showing relevant content</Text>
          </View>
        </View>

        {/* Why Local */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✅ Why 100% Local?</Text>
          <Text style={styles.sectionText}>
            • No internet dependency for core functionality
          </Text>
          <Text style={styles.sectionText}>
            • Your sensitive data never leaves your device
          </Text>
          <Text style={styles.sectionText}>
            • No tracking, no analytics, no profiling
          </Text>
          <Text style={styles.sectionText}>
            • Complete control over your personal information
          </Text>
        </View>
      </ScrollView>

      {/* Button */}
      <TouchableOpacity style={styles.button} onPress={props.onComplete}>
        <Text style={styles.buttonText}>I Understand & Continue</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  scroll: {
    flex: 1,
    marginBottom: 20,
  },
  hero: {
    marginBottom: 28,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
    marginBottom: 12,
  },
  sectionText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  permissionItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    backgroundColor: "rgba(69, 224, 161, 0.08)",
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  permissionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  permissionContent: {
    flex: 1,
  },
  permissionName: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 4,
  },
  permissionDesc: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    backgroundColor: "rgba(13, 20, 40, 0.6)",
    borderRadius: 10,
    padding: 12,
  },
  stepNumber: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 18,
    marginRight: 12,
    minWidth: 30,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 4,
  },
  stepDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  featureItem: {
    marginBottom: 12,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  featureLabel: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 4,
  },
  featureDesc: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    marginBottom: 8,
  },
  buttonText: {
    color: "#072117",
    fontWeight: "800",
    fontSize: 16,
  },
});
