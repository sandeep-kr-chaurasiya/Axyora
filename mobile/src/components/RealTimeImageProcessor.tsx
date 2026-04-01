import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { colors } from '../theme/colors';
import { fontFamily, typography } from '../theme/fonts';

export interface ProcessingImageData {
  id: string;
  uri: string;
  name: string;
  status: 'pending' | 'downloading' | 'uploading' | 'extracting' | 'storing' | 'indexing' | 'complete' | 'error';
  progress: number; // 0-100
  fileSize?: number;
  dimensions?: { width: number; height: number };
  error?: string;
  details?: {
    caption?: string;
    objects?: string[];
    text?: string;
    timeTaken?: number;
  };
}

interface RealTimeImageProcessorProps {
  images: ProcessingImageData[];
  currentProcessing?: ProcessingImageData;
  totalProgress: number;
}

const statusColors: Record<string, string> = {
  pending: colors.textMuted,
  downloading: colors.accentAlt,
  uploading: colors.accentLight,
  extracting: colors.warning,
  storing: colors.accentLight,
  indexing: colors.accent,
  complete: colors.success,
  error: colors.danger,
};

const statusLabels: Record<string, string> = {
  pending: 'Waiting',
  downloading: 'Downloading',
  uploading: 'Uploading',
  extracting: 'Analysing',
  storing: 'Storing',
  indexing: 'Indexing',
  complete: 'Complete',
  error: 'Failed',
};

export function RealTimeImageProcessor({ images, currentProcessing, totalProgress }: RealTimeImageProcessorProps) {
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    const completed = images.filter(img => img.status === 'complete' || img.status === 'error').length;
    setCompletedCount(completed);
  }, [images]);

  return (
    <View style={styles.container}>
      {/* Overall Progress Section */}
      <View style={styles.overallProgressSection}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressTitle, { fontFamily: fontFamily.bold }]}>Image Processing Pipeline</Text>
          <Text style={[styles.progressCount, { fontFamily: fontFamily.semiBold }]}>
            {completedCount} / {images.length}
          </Text>
        </View>

        <View style={styles.overallProgressBar}>
          <View style={[styles.progressFill, { width: `${totalProgress}%`, backgroundColor: colors.accent }]} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { fontFamily: fontFamily.regular }]}>Progress</Text>
            <Text style={[styles.statValue, { fontFamily: fontFamily.bold }]}>{totalProgress}%</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { fontFamily: fontFamily.regular }]}>Processing</Text>
            <Text style={[styles.statValue, { fontFamily: fontFamily.bold }]}>
              {images.filter(i => i.status !== 'pending').length}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { fontFamily: fontFamily.regular }]}>Speed</Text>
            <Text style={[styles.statValue, { fontFamily: fontFamily.bold }]}>Fast</Text>
          </View>
        </View>
      </View>

      {/* Current Processing Image (Large) */}
      {currentProcessing && (
        <View style={styles.currentProcessingSection}>
          <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>Currently Processing</Text>
          
          <View style={styles.currentCard}>
            {/* Image Preview */}
            <View style={styles.largeImageContainer}>
              <Image
                source={{ uri: currentProcessing.uri }}
                style={styles.largeImage}
                resizeMode="cover"
              />
              {currentProcessing.status === 'complete' && (
                <View style={styles.completeOverlay}>
                  <Text style={styles.completeCheckmark}>OK</Text>
                </View>
              )}
              {currentProcessing.status === 'error' && (
                <View style={styles.errorOverlay}>
                  <Text style={styles.errorIcon}>!</Text>
                </View>
              )}
              {(currentProcessing.status === 'extracting' || currentProcessing.status === 'indexing') && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator color={colors.accent} size="large" />
                </View>
              )}
            </View>

            {/* File Details */}
            <View style={styles.detailsContainer}>
              <Text style={[styles.fileName, { fontFamily: fontFamily.semiBold }]} numberOfLines={2}>
                {currentProcessing.name}
              </Text>

              {/* Status & Progress */}
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusColors[currentProcessing.status] + '20' },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: statusColors[currentProcessing.status] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { fontFamily: fontFamily.semiBold, color: statusColors[currentProcessing.status] },
                    ]}
                  >
                    {statusLabels[currentProcessing.status]}
                  </Text>
                </View>
                <Text style={[styles.progressPercent, { fontFamily: fontFamily.bold }]}>
                  {currentProcessing.progress}%
                </Text>
              </View>

              {/* Detailed Progress Steps */}
              <View style={styles.stepsContainer}>
                {[
                  { step: 'Download', status: currentProcessing.status !== 'pending' ? 'complete' : 'pending' },
                  { step: 'Extract', status: ['extracting', 'storing', 'indexing', 'complete'].includes(currentProcessing.status) ? 'active' : 'pending' },
                  { step: 'Store', status: ['storing', 'indexing', 'complete'].includes(currentProcessing.status) ? 'active' : 'pending' },
                  { step: 'Index', status: currentProcessing.status === 'complete' ? 'complete' : currentProcessing.status === 'indexing' ? 'active' : 'pending' },
                ].map((item, idx) => (
                  <View key={idx} style={styles.stepRow}>
                    <View
                      style={[
                        styles.stepCircle,
                        item.status === 'complete' && styles.stepComplete,
                        item.status === 'active' && styles.stepActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.stepNum,
                          { fontFamily: fontFamily.semiBold },
                        item.status !== 'pending' && { color: colors.text },
                      ]}
                    >
                        {item.status === 'complete' ? 'OK' : idx + 1}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.stepLabel,
                        { fontFamily: fontFamily.regular },
                        item.status !== 'pending' && { color: colors.text },
                      ]}
                    >
                      {item.step}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Extracted Details if Available */}
              {currentProcessing.details && (
                <View style={styles.extractedDetailsContainer}>
                  {currentProcessing.details.caption && (
                    <View style={styles.detailItem}>
                      <Text style={[styles.detailLabel, { fontFamily: fontFamily.semiBold }]}>Caption</Text>
                      <Text style={[styles.detailValue, { fontFamily: fontFamily.regular }]} numberOfLines={2}>
                        {currentProcessing.details.caption}
                      </Text>
                    </View>
                  )}

                  {currentProcessing.details.objects && currentProcessing.details.objects.length > 0 && (
                    <View style={styles.detailItem}>
                      <Text style={[styles.detailLabel, { fontFamily: fontFamily.semiBold }]}>Objects Found</Text>
                      <View style={styles.tagsContainer}>
                        {currentProcessing.details.objects.slice(0, 5).map((obj, idx) => (
                          <View key={idx} style={styles.tag}>
                            <Text style={[styles.tagText, { fontFamily: fontFamily.regular }]}>{obj}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {currentProcessing.details.text && (
                    <View style={styles.detailItem}>
                      <Text style={[styles.detailLabel, { fontFamily: fontFamily.semiBold }]}>Text Found</Text>
                      <Text style={[styles.detailValue, { fontFamily: fontFamily.regular }]} numberOfLines={3}>
                        {currentProcessing.details.text}
                      </Text>
                    </View>
                  )}

                  {currentProcessing.details.timeTaken && (
                    <View style={styles.detailItem}>
                      <Text style={[styles.detailLabel, { fontFamily: fontFamily.semiBold }]}>Time Taken</Text>
                      <Text style={[styles.detailValue, { fontFamily: fontFamily.regular }]}>
                        {currentProcessing.details.timeTaken}s
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Thumbnail List of Recent Images */}
      {images.length > 1 && (
        <View style={styles.thumbnailSection}>
          <Text style={[styles.sectionTitle, { fontFamily: fontFamily.bold }]}>
            Queue ({images.filter(i => i.status === 'pending').length} remaining)
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.thumbnailScroll}
            contentContainerStyle={styles.thumbnailContent}
          >
            {images.map((img, idx) => (
              <View key={img.id} style={styles.thumbnailWrapper}>
                <View
                  style={[
                    styles.thumbnailContainer,
                    img.status === 'error' && styles.thumbnailError,
                    currentProcessing?.id === img.id && styles.thumbnailActive,
                  ]}
                >
                  <Image source={{ uri: img.uri }} style={styles.thumbnail} resizeMode="cover" />

                  {img.status === 'complete' && (
                    <View style={styles.thumbnailBadge}>
                      <Text style={styles.badgeIcon}>OK</Text>
                    </View>
                  )}
                  {img.status === 'error' && (
                    <View style={[styles.thumbnailBadge, styles.thumbnailBadgeError]}>
                      <Text style={styles.badgeIcon}>!</Text>
                    </View>
                  )}
                  {(img.status === 'extracting' || img.status === 'indexing') && (
                    <View style={styles.thumbnailBadge}>
                      <ActivityIndicator size="small" color={colors.accent} />
                    </View>
                  )}
                </View>
                <View style={styles.thumbnailProgressBar}>
                  <View style={[styles.thumbnailProgressFill, { width: `${img.progress}%` }]} />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingVertical: 16,
  },

  // Overall Progress Section
  overallProgressSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 16,
    color: colors.text,
  },
  progressCount: {
    fontSize: 14,
    color: colors.accent,
  },
  overallProgressBar: {
    height: 8,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 60,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    color: colors.accent,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.borderLight,
  },

  // Current Processing Section
  currentProcessingSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Large Image Preview
  largeImageContainer: {
    width: '100%',
    height: 280,
    backgroundColor: colors.backgroundTertiary,
    position: 'relative',
  },
  largeImage: {
    width: '100%',
    height: '100%',
  },
  completeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeCheckmark: {
    fontSize: 60,
    fontWeight: '900',
    color: colors.success,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 50,
    fontWeight: '900',
    color: colors.danger,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Details Container
  detailsContainer: {
    padding: 16,
  },
  fileName: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 12,
  },

  // Status Row
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
  },
  progressPercent: {
    fontSize: 14,
    color: colors.accent,
  },

  // Steps Container
  stepsContainer: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepActive: {
    backgroundColor: colors.accent + '20',
    borderColor: colors.accent,
  },
  stepComplete: {
    backgroundColor: colors.success + '20',
    borderColor: colors.success,
  },
  stepNum: {
    fontSize: 12,
    color: colors.textMuted,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },

  // Extracted Details
  extractedDetailsContainer: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 12,
  },
  detailItem: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 13,
    color: colors.text,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: colors.accent + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    color: colors.accent,
  },

  // Thumbnail Section
  thumbnailSection: {
    paddingHorizontal: 16,
  },
  thumbnailScroll: {
    marginTop: 12,
  },
  thumbnailContent: {
    paddingRight: 16,
    gap: 12,
  },
  thumbnailWrapper: {
    alignItems: 'center',
  },
  thumbnailContainer: {
    width: 100,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.borderLight,
    backgroundColor: colors.backgroundTertiary,
  },
  thumbnailActive: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  thumbnailError: {
    borderColor: colors.danger,
    opacity: 0.6,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailBadgeError: {
    backgroundColor: colors.danger,
  },
  badgeIcon: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  thumbnailProgressBar: {
    width: 100,
    height: 2,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  thumbnailProgressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
});
