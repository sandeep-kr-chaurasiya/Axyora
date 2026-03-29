/**
 * App Lifecycle & Permission Management
 * - Request all permissions on app start
 * - Manage resume/pause queue behavior
 * - Persistent permission state
 */

import { AppState, Platform, type AppStateStatus } from "react-native";
import { useEffect, useRef, useState } from "react";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { persistentQueue } from "../services/persistentQueue";

const PERMISSIONS_STORAGE_KEY = "@axyora/permissions-status";
const PERMISSIONS_PROMPT_KEY = "@axyora/permissions-prompted-at";

export interface PermissionState {
  media: boolean;
  files: boolean;
  camera?: boolean;
  microphone?: boolean;
  promptedAt: number;
}

/**
 * Request comprehensive permissions on app launch
 * On iOS: Requests media library & photo library
 * On Android: Requests READ_EXTERNAL_STORAGE + READ_MEDIA_*
 */
export async function requestOnInstallPermissions(): Promise<PermissionState> {
  const state: PermissionState = {
    media: false,
    files: false,
    promptedAt: Date.now(),
  };

  try {
    // Media Library (images/audio)
    const mediaResult = await MediaLibrary.requestPermissionsAsync(false);
    state.media =
      mediaResult.granted === true ||
      (mediaResult.accessPrivileges &&
        mediaResult.accessPrivileges.indexOf("all") >= 0) ||
      false;

    // Files: reasonable defaults based on platform
    if (Platform.OS === "ios") {
      // iOS 17+: Can access Documents via MediaLibrary
      state.files = state.media;
    } else {
      // Android: READ_EXTERNAL_STORAGE + READ_MEDIA_* declared in AndroidManifest
      state.files = true;
    }

    // Store permission state
    await AsyncStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(state));
    await AsyncStorage.setItem(PERMISSIONS_PROMPT_KEY, String(Date.now()));

    console.log("[Permissions] Granted:", state);
    return state;
  } catch (error) {
    console.error("[Permissions] Failed to request permissions", error);
    return state;
  }
}

/**
 * Get stored permission state
 */
export async function getPermissionState(): Promise<PermissionState | null> {
  try {
    const stored = await AsyncStorage.getItem(PERMISSIONS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function useAppLifecycle(): {
  appState: AppStateStatus;
  permissions: PermissionState | null;
} {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [permissions, setPermissions] = useState<PermissionState | null>(null);

  useEffect(() => {
    // Initial setup: request permissions & load stored state
    (async () => {
      const perms = await requestOnInstallPermissions();
      setPermissions(perms);
    })();
  }, []);

  const handleAppStateChange = (state: AppStateStatus) => {
    if (
      appStateRef.current.match(/inactive|background/) &&
      state === "active"
    ) {
      console.log("[AppLifecycle] App resumed → resuming queue");
      persistentQueue.resume();
    } else if (state.match(/inactive|background/)) {
      console.log("[AppLifecycle] App paused → pausing queue");
      persistentQueue.pause();
    }

    appStateRef.current = state;
    setAppState(state);
  };

  useEffect(() => {
    // Subscribe to app state changes
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    appState,
    permissions,
  };
}