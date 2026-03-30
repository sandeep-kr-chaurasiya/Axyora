import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
} from "react-native";
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

const { width, height } = Dimensions.get("window");

// Grid layout constants - scoped outside component for efficiency
const GRID_COLS = 3;
const GAP = 6;
const ITEM_SIZE = (width - 48 - GAP * 2) / GRID_COLS;

interface ChatImageGridProps {
  images: ImageResult[];
  maxImages?: number;
}

export function ChatImageGrid(props: ChatImageGridProps) {
  const { images, maxImages = 6 } = props;
  const [expandedImage, setExpandedImage] = useState<ImageResult | null>(null);
  
  // Show only top 6 most relevant images
  const topImages = images.slice(0, maxImages);

  const renderImageItem = ({ item }: { item: ImageResult }) => {
    // Debug logging for image loading
    console.log(`[ChatImageGrid] Rendering image: ${item.file_name}`);
    console.log(`[ChatImageGrid] File path: ${item.file_path}`);
    console.log(`[ChatImageGrid] Image URI: ${item.image_uri}`);
    console.log(`[ChatImageGrid] Score: ${item.score}`);

    // Ensure proper file URI construction
    let imageUri: string | null = null;
    if (item.image_uri) {
      let path = item.image_uri as string;
      
      // If already a complete file:// URI, use as-is
      if (path.startsWith("file://")) {
        imageUri = path;
      } else {
        // Otherwise, construct file:// URI
        // Ensure it starts with /
        if (!path.startsWith("/")) {
          path = "/" + path;
        }
        imageUri = `file://${path}`;
      }
      console.log(`[ChatImageGrid] Constructed URI: ${imageUri}`);
    } else {
      console.warn(`[ChatImageGrid] No image_uri provided for ${item.file_name}`);
    }

    return (
      <TouchableOpacity 
        activeOpacity={0.8} 
        style={styles.gridItem}
        onPress={() => {
          console.log(`[ChatImageGrid] Image tapped: ${item.file_name}`);
          setExpandedImage(item);
        }}
      >
        {/* Small Image Thumbnail */}
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="cover"
            onLoad={() => console.log(`[ChatImageGrid] Image loaded: ${item.file_name}`)}
            onError={(error) => {
              console.error(`[ChatImageGrid] Image failed to load: ${item.file_name}`);
              console.error(`[ChatImageGrid] Error: ${JSON.stringify(error)}`);
              console.error(`[ChatImageGrid] Attempted URI: ${imageUri}`);
            }}
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderIcon}>🖼️</Text>
          </View>
        )}

        {/* Score Badge */}
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{(item.score * 100).toFixed(0)}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (topImages.length === 0) {
    return null;
  }

  return (
    <>
      {/* Chat Thumbnail Grid */}
      <View style={styles.container}>
        <FlatList
          data={topImages}
          renderItem={renderImageItem}
          keyExtractor={(item, idx) => `${item.file_name}-${idx}`}
          numColumns={GRID_COLS}
          columnWrapperStyle={styles.row}
          scrollEnabled={false}
          style={styles.gridContainer}
          contentContainerStyle={styles.gridContent}
        />
      </View>

      {/* Expanded Image Modal - Simplified View */}
      <Modal
        visible={expandedImage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setExpandedImage(null)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setExpandedImage(null)}
          >
            <View style={styles.modalContent}>
              {/* File Location */}
              <View style={styles.locationBar}>
                <Text style={styles.locationIcon}>📁</Text>
                <Text style={styles.locationText} numberOfLines={1}>
                  {expandedImage?.file_path || expandedImage?.file_name}
                </Text>
              </View>

              {/* Image Display */}
              {expandedImage?.image_uri && (
                <Image
                  source={{ uri: (() => {
                    let path = expandedImage.image_uri;
                    if (path.startsWith("file://")) {
                      return path;
                    }
                    if (!path.startsWith("/")) {
                      path = "/" + path;
                    }
                    return `file://${path}`;
                  })() }}
                  style={styles.expandedImage}
                  resizeMode="contain"
                  onError={() => console.warn(`[Image] Failed to load expanded: ${expandedImage.file_name}`)}
                />
              )}
            </View>
          </TouchableOpacity>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setExpandedImage(null)}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    marginBottom: 12,
  },
  gridContainer: {
    width: "100%",
  },
  gridContent: {
    gap: GAP,
  },
  row: {
    gap: GAP,
    justifyContent: "space-between",
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: "#111827",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  image: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1F2937",
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
    color: "#06070B",
    fontSize: 9,
    fontWeight: "700",
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxHeight: "80%",
    backgroundColor: "#111A2A",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  locationBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  locationIcon: {
    fontSize: 16,
  },
  locationText: {
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  expandedImage: {
    width: "100%",
    height: 400,
    backgroundColor: "#1F2937",
  },
  expandedInfo: {
    padding: 16,
  },
  expandedTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  expandedScore: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
  captionScroll: {
    maxHeight: 100,
    marginTop: 8,
  },
  expandedCaption: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  closeButton: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 44,
    height: 44,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "400",
  },
});
