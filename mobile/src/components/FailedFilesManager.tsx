import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/colors';
import { fontFamily, typography } from '../theme/fonts';

export interface FailedFile {
  id: string;
  name: string;
  path: string;
  fileType: 'image' | 'video' | 'document' | 'audio';
  fileSize?: number;
  error: string;
  failedAt: number;
  retryCount: number;
}

interface FailedFilesManagerProps {
  failedFiles: FailedFile[];
  onRetryFile: (fileId: string) => Promise<void>;
  onRemoveFile: (fileId: string) => Promise<void>;
  onRetryAll: () => Promise<void>;
  isLoading?: boolean;
}

const fileTypeLabels: Record<string, string> = {
  image: 'IMG',
  video: 'VID',
  document: 'DOC',
  audio: 'AUD',
};

const errorDescriptions: Record<string, string> = {
  NETWORK_ERROR: 'Network connection failed',
  TIMEOUT: 'Processing timed out',
  INVALID_FORMAT: 'Unsupported file format',
  FILE_CORRUPTED: 'File appears to be corrupted',
  STORAGE_ERROR: 'Storage access denied',
  PERMISSION_ERROR: 'Permission denied',
  UNKNOWN: 'Unknown error occurred',
};

export function FailedFilesManager({
  failedFiles,
  onRetryFile,
  onRemoveFile,
  onRetryAll,
  isLoading = false,
}: FailedFilesManagerProps) {
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);

  if (failedFiles.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyEmoji, { fontFamily: fontFamily.bold }]}>OK</Text>
        <Text style={[styles.emptyTitle, { fontFamily: fontFamily.bold }]}>No Failed Files</Text>
        <Text style={[styles.emptySubtitle, { fontFamily: fontFamily.regular }]}>
          All files processed successfully!
        </Text>
      </View>
    );
  }

  const handleRetryFile = async (fileId: string) => {
    setLoadingFileId(fileId);
    try {
      await onRetryFile(fileId);
      Alert.alert('Success', 'File retry queued');
    } catch (error) {
      Alert.alert('Error', `Failed to retry file: ${error}`);
    } finally {
      setLoadingFileId(null);
    }
  };

  const handleRemoveFile = async (fileId: string, fileName: string) => {
    Alert.alert(
      'Remove from Index',
      `Remove "${fileName}" from processing queue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingFileId(fileId);
            try {
              await onRemoveFile(fileId);
              Alert.alert('Removed', 'File removed from index');
            } catch (error) {
              Alert.alert('Error', `Failed to remove file: ${error}`);
            } finally {
              setRemovingFileId(null);
            }
          },
        },
      ]
    );
  };

  const handleRetryAll = async () => {
    Alert.alert(
      'Retry All Failed Files',
      `Retry ${failedFiles.length} failed files?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retry All',
          onPress: async () => {
            try {
              await onRetryAll();
              Alert.alert('Success', 'All files queued for retry');
            } catch (error) {
              Alert.alert('Error', `Failed to retry all: ${error}`);
            }
          },
        },
      ]
    );
  };

  const calculateFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <View style={styles.container}>
      {/* Header with Action */}
      <View style={styles.headerSection}>
        <View>
          <Text style={[styles.headerTitle, { fontFamily: fontFamily.bold }]}>Failed Files</Text>
          <Text style={[styles.headerSubtitle, { fontFamily: fontFamily.regular }]}>
            {failedFiles.length} file{failedFiles.length !== 1 ? 's' : ''} need attention
          </Text>
        </View>
        <TouchableOpacity
          style={styles.retryAllBtn}
          onPress={handleRetryAll}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={[styles.retryAllBtnText, { fontFamily: fontFamily.bold }]}>Retry All</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.filesList}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.filesListContent}
      >
        {failedFiles.map((file, idx) => (
          <View key={file.id} style={styles.fileItem}>
            {/* File Icon & Type */}
            <View style={styles.fileIconContainer}>
              <Text style={styles.fileIcon}>{fileTypeLabels[file.fileType] || 'FILE'}</Text>
            </View>

            {/* File Info */}
            <View style={styles.fileInfoContainer}>
              {/* File Name */}
              <Text style={[styles.fileName, { fontFamily: fontFamily.semiBold }]} numberOfLines={2}>
                {file.name}
              </Text>

              {/* Error Info */}
              <View style={styles.errorBadge}>
                <Text style={[styles.errorBadgeText, { fontFamily: fontFamily.regular }]}>
                  {errorDescriptions[file.error] || file.error}
                </Text>
              </View>

              {/* File Details Grid */}
              <View style={styles.detailsGrid}>
                <View style={styles.detailCell}>
                  <Text style={[styles.detailLabel, { fontFamily: fontFamily.regular }]}>Size</Text>
                  <Text style={[styles.detailValue, { fontFamily: fontFamily.medium }]}>
                    {calculateFileSize(file.fileSize)}
                  </Text>
                </View>

                <View style={styles.detailDivider} />

                <View style={styles.detailCell}>
                  <Text style={[styles.detailLabel, { fontFamily: fontFamily.regular }]}>Failed</Text>
                  <Text style={[styles.detailValue, { fontFamily: fontFamily.medium }]}>
                    {getTimeAgo(file.failedAt)}
                  </Text>
                </View>

                <View style={styles.detailDivider} />

                <View style={styles.detailCell}>
                  <Text style={[styles.detailLabel, { fontFamily: fontFamily.regular }]}>Retries</Text>
                  <Text style={[styles.detailValue, { fontFamily: fontFamily.medium }]}>
                    {file.retryCount}{file.retryCount >= 3 ? ' HIGH' : ''}
                  </Text>
                </View>
              </View>

              {/* Full Error Message */}
              <View style={styles.errorDetails}>
                <Text style={[styles.errorDetailsText, { fontFamily: fontFamily.regular }]} numberOfLines={2}>
                  {file.error}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.retryBtn]}
                onPress={() => handleRetryFile(file.id)}
                disabled={loadingFileId === file.id}
              >
                {loadingFileId === file.id ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Text style={[styles.actionBtnText, { fontFamily: fontFamily.bold }]}>↻</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.removeBtn]}
                onPress={() => handleRemoveFile(file.id, file.name)}
                disabled={removingFileId === file.id}
              >
                {removingFileId === file.id ? (
                  <ActivityIndicator color={colors.danger} size="small" />
                ) : (
                  <Text style={[styles.actionBtnText, styles.removeBtnText, { fontFamily: fontFamily.bold }]}>×</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Tips Section */}
      <View style={styles.tipsSection}>
        <Text style={[styles.tipsTitle, { fontFamily: fontFamily.bold }]}>Tips</Text>
        <Text style={[styles.tipText, { fontFamily: fontFamily.regular }]}>
          • Check internet connection before retrying{'\n'}
          • Remove corrupted files to speed up processing{'\n'}
          • Failed files don't block other files
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 16,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  emptyEmoji: {
    fontSize: 42,
    letterSpacing: 2,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },

  // Header
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    color: colors.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  retryAllBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  retryAllBtnText: {
    fontSize: 12,
    color: colors.background,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Files List
  filesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  filesListContent: {
    gap: 12,
    paddingBottom: 16,
  },

  // File Item
  fileItem: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  // File Icon
  fileIconContainer: {
    width: 60,
    height: 160,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
  },
  fileIcon: {
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textSecondary,
    fontWeight: '700',
  },

  // File Info
  fileInfoContainer: {
    flex: 1,
    padding: 12,
  },
  fileName: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
  },

  // Error Badge
  errorBadge: {
    backgroundColor: colors.danger + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.danger + '30',
  },
  errorBadgeText: {
    fontSize: 11,
    color: colors.danger,
  },

  // Details Grid
  detailsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailCell: {
    flex: 1,
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 11,
    color: colors.text,
  },
  detailDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.borderLight,
    marginHorizontal: 8,
  },

  // Error Details
  errorDetails: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  errorDetailsText: {
    fontSize: 10,
    color: colors.textMuted,
  },

  // Actions
  actionsContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderLight,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryBtn: {
    backgroundColor: colors.accent + '20',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  removeBtn: {
    backgroundColor: colors.danger + '20',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  actionBtnText: {
    fontSize: 16,
    color: colors.accent,
  },
  removeBtnText: {
    color: colors.danger,
  },

  // Tips Section
  tipsSection: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  tipsTitle: {
    fontSize: 12,
    color: colors.accent,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tipText: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
});
