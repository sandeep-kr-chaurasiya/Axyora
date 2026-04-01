import { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  useWindowDimensions,
  FlatList,
  Modal,
  ScrollView,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

export interface ImageResult {
  file_name: string;
  file_path: string;
  caption?: string;
  preview?: string;
  image_uri?: string;
  thumbnail_path?: string;
  score: number;
  type: "image";
}

const GAP = 6;

interface ChatImageGridProps {
  images: ImageResult[];
  maxImages?: number;
}

export function ChatImageGrid(props: ChatImageGridProps) {
  const { images, maxImages = 6 } = props;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const closeStampRef = useRef(0);
  const [failedImageNames, setFailedImageNames] = useState<Set<string>>(new Set());
  const isPortrait = height >= width;
  const gridCols = isPortrait ? 2 : 3;
  
  // Show only top 6 most relevant images, filtered to exclude HEIC and failed images
  const validImages = images
    .filter(img => {
      // Skip HEIC files (not well supported on iOS simulator/native)
      if (img.file_name.toLowerCase().endsWith('.heic')) {
        return false;
      }
      // Skip images that failed to load
      if (failedImageNames.has(img.file_name)) {
        return false;
      }
      return !!img.image_uri;
    })
    .slice(0, maxImages);

  const resolveImageUri = (item: ImageResult): string | null => {
    let path = item.image_uri as string;
    if (!path) return null;
    if (path.startsWith("file://")) {
      return path;
    }
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    return `file://${path}`;
  };

  const closeViewer = () => {
    closeStampRef.current = Date.now();
    setExpandedIndex(null);
  };

  const renderImageItem = ({ item, index }: { item: ImageResult; index: number }) => {
    // Ensure proper file URI construction
    const imageUri = resolveImageUri(item);

    return (
      <TouchableOpacity 
        activeOpacity={0.8} 
        style={styles.gridItem}
        onPress={() => {
          setExpandedIndex(index);
        }}
      >
        {/* Small Image Thumbnail */}
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="cover"
            onLoad={() => {
              // Successfully loaded
              setFailedImageNames(prev => {
                const updated = new Set(prev);
                updated.delete(item.file_name);
                return updated;
              });
            }}
            onError={() => {
              console.warn(`[ChatImageGrid] Failed to load: ${item.file_name}`);
              // Mark as failed to exclude from grid
              setFailedImageNames(prev => new Set(prev).add(item.file_name));
            }}
          />
        ) : null}

        {/* Score Badge */}
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{(item.score * 100).toFixed(0)}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (validImages.length === 0) {
    return null;
  }

  const expandedImage = expandedIndex !== null ? validImages[expandedIndex] : null;

  return (
    <>
      {/* Chat Thumbnail Grid */}
      <View style={styles.container}>
        <FlatList
          data={validImages}
          renderItem={renderImageItem}
          keyExtractor={(item, idx) => `${item.file_name}-${idx}`}
          numColumns={gridCols}
          columnWrapperStyle={styles.row}
          scrollEnabled={false}
          style={styles.gridContainer}
          contentContainerStyle={styles.gridContent}
        />
      </View>

      {/* Expanded Image Modal - Swipe + Zoom */}
      <Modal
        visible={expandedIndex !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={closeViewer}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalTopBar, { paddingTop: Math.max(insets.top, 16) }]}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {expandedImage?.file_name || "Preview"}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={async () => {
                  if (!expandedImage) return;
                  const uri = resolveImageUri(expandedImage);
                  if (!uri) return;
                  try {
                    await Share.share({
                      url: uri,
                      message: expandedImage.file_name || uri,
                    });
                  } catch (err) {
                    console.warn("[ChatImageGrid] Share failed", err);
                  }
                }}
              >
                <Text style={styles.actionText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonClose]}
                onPress={closeViewer}
              >
                <Text style={[styles.actionText, styles.actionTextClose]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={validImages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, idx) => `${item.file_name}-full-${idx}`}
            initialScrollIndex={expandedIndex ?? 0}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              if (expandedIndex === null) return;
              if (Date.now() - closeStampRef.current < 300) return;
              const nextIndex = Math.round(e.nativeEvent.contentOffset.x / width);
              setExpandedIndex(nextIndex);
            }}
            renderItem={({ item }) => {
              const uri = resolveImageUri(item);
              return (
                <View style={[styles.viewerPage, { width, height }]}>
                  <ScrollView
                    maximumZoomScale={3}
                    minimumZoomScale={1}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.zoomContainer}
                    pinchGestureEnabled
                  >
                    {uri && (
                      <Image
                        source={{ uri }}
                        style={[styles.expandedImage, { width, height: height * 0.78 }]}
                        resizeMode="contain"
                        onError={() =>
                          console.warn(`[Image] Failed to load expanded: ${item.file_name}`)
                        }
                      />
                    )}
                  </ScrollView>
                  <View style={styles.viewerMeta}>
                    <Text style={styles.viewerMetaText} numberOfLines={1}>
                      {item.file_path || item.file_name}
                    </Text>
                    <Text style={styles.viewerMetaSub}>
                      {expandedIndex !== null ? expandedIndex + 1 : 1} / {validImages.length}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  gridContainer: {
    width: "100%",
  },
  gridContent: {
    gap: GAP,
  },
  row: {
    gap: GAP,
    justifyContent: "flex-start",
  },
  gridItem: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surfaceLight,
  },
  imagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIcon: {
    fontSize: 24,
  },
  scoreBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scoreText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: "700",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(5,5,7,0.98)",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  modalTopBar: {
    width: "100%",
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionButtonClose: {
    backgroundColor: "rgba(248,113,113,0.14)",
    borderColor: "rgba(248,113,113,0.35)",
  },
  actionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  actionTextClose: {
    color: "#fca5a5",
  },
  viewerPage: {
    justifyContent: "center",
    alignItems: "center",
  },
  zoomContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  expandedImage: {
    backgroundColor: colors.surfaceLight,
  },
  viewerMeta: {
    width: "100%",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  viewerMetaText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  viewerMetaSub: {
    marginTop: 4,
    color: colors.text,
    fontSize: 11,
    fontWeight: "600",
  },
});
