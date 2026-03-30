import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  Dimensions,
  FlatList,
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

const { width } = Dimensions.get("window");
const GRID_COLS = 2;
const GAP = 8;
const ITEM_SIZE = (width - 40 - GAP) / GRID_COLS;

export function ImageGridComponent(props: { images: ImageResult[] }) {
  const { images } = props;

  const renderImageItem = ({ item }: { item: ImageResult }) => (
    <TouchableOpacity activeOpacity={0.8} style={styles.gridItem}>
      {/* Image Thumbnail */}
      {item.image_uri ? (
        <Image
          source={{ uri: `file://${item.image_uri}` }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.placeholderIcon}>🖼️</Text>
        </View>
      )}

      {/* Overlay with Info */}
      <View style={styles.overlay}>
        {/* Score Badge - Higher is better match */}
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{(item.score * 100).toFixed(0)}%</Text>
        </View>
      </View>

      {/* File Info Below Image */}
      <View style={styles.infoContainer}>
        <Text style={styles.fileName} numberOfLines={1}>
          {item.file_name}
        </Text>
        <Text style={styles.filePath} numberOfLines={1}>
          {item.file_path.split("/").pop()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <FlatList
      data={images}
      renderItem={renderImageItem}
      keyExtractor={(item, idx) => `${item.file_name}-${idx}`}
      numColumns={GRID_COLS}
      columnWrapperStyle={styles.row}
      scrollEnabled={true}
      nestedScrollEnabled={true}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxHeight: 400,
  },
  contentContainer: {
    paddingBottom: 16,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    backgroundColor: "#111827",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  image: {
    width: "100%",
    height: ITEM_SIZE,
    backgroundColor: "#1F2937",
  },
  imagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIcon: {
    fontSize: 32,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    justifyContent: "space-between",
    padding: 8,
  },
  scoreBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-end",
  },
  scoreText: {
    color: "#06070B",
    fontSize: 11,
    fontWeight: "700",
  },
  infoContainer: {
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  fileName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 3,
  },
  filePath: {
    color: colors.textMuted,
    fontSize: 10,
  },
});
