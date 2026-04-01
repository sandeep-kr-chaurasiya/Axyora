import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";

import { useAuth } from "./src/hooks/useAuth";
import { useAppLifecycle } from "./src/hooks/useAppLifecycle";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthScreen } from "./src/screens/AuthScreen";
import { SwipeableOnboardingScreen } from "./src/screens/SwipeableOnboardingScreen";
import { EnhancedPermissionsScreen } from "./src/screens/EnhancedPermissionsScreen";
import { DiscoveryScreen } from "./src/screens/DiscoveryScreen";
import { SplashScreen } from "./src/screens/SplashScreen";
import { persistentQueue } from "./src/services/persistentQueue";
import { colors } from "./src/theme/colors";

const ONBOARDING_KEY = "@axyora/onboarding-complete";
const PERMISSIONS_KEY = "@axyora/permissions-granted";
const AUTO_SCAN_KEY = "@axyora_auto_scan_state";
const ANDROID_DIRECTORY_URI_KEY = "@axyora/android-directory-uri";
const QUEUE_STORAGE_KEY = "@axyora/persistent-queue";

export default function App() {
  const { user, loading, signIn, signUp } = useAuth();
  // Initialize app lifecycle (permissions, queue persistence, app state monitoring)
  useAppLifecycle();

  const [showSplash, setShowSplash] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [permissionsDone, setPermissionsDone] = useState(false);
  const [autoScanDone, setAutoScanDone] = useState(false);
  const [queueReady, setQueueReady] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [onboarding, perms, autoScan] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_KEY),
        AsyncStorage.getItem(PERMISSIONS_KEY),
        AsyncStorage.getItem(AUTO_SCAN_KEY),
      ]);

      const [androidDirectoryUri, queueStateRaw] = await Promise.all([
        Platform.OS === "android" ? AsyncStorage.getItem(ANDROID_DIRECTORY_URI_KEY) : Promise.resolve(null),
        AsyncStorage.getItem(QUEUE_STORAGE_KEY),
      ]);
      if (!alive) {
        return;
      }
      setOnboardingDone(onboarding === "1");
      setPermissionsDone(perms === "1");
      
      // Mark auto scan as done if it completed successfully
      if (autoScan) {
        try {
          const state = JSON.parse(autoScan);
          let hasQueueItems = false;
          if (queueStateRaw) {
            try {
              const queueState = JSON.parse(queueStateRaw) as { items?: unknown[] };
              hasQueueItems = Array.isArray(queueState.items) && queueState.items.length > 0;
            } catch {
              hasQueueItems = false;
            }
          }

          setAutoScanDone(
            state.status === "complete" &&
            Number(state.totalCount || 0) > 0 &&
            hasQueueItems
          );
        } catch {
          setAutoScanDone(false);
        }
      }
      
      setBootLoading(false);
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setQueueReady(false);
      return;
    }

    let active = true;
    void persistentQueue.initialize(user.uid).then(() => {
      if (active) {
        setQueueReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, [user?.uid]);

  if (showSplash) {
    return <SplashScreen />;
  }

  if (loading || bootLoading || (Boolean(user) && !queueReady)) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!onboardingDone) {
    return (
      <SwipeableOnboardingScreen
        onComplete={async () => {
          await AsyncStorage.setItem(ONBOARDING_KEY, "1");
          setOnboardingDone(true);
        }}
      />
    );
  }

  if (!user) {
    return <AuthScreen onSignIn={signIn} onSignUp={signUp} />;
  }

  if (!permissionsDone) {
    return (
      <EnhancedPermissionsScreen
        onGranted={async () => {
          await AsyncStorage.setItem(PERMISSIONS_KEY, "1");
          setPermissionsDone(true);
        }}
        onSkip={() => setPermissionsDone(true)}
      />
    );
  }

  if (!autoScanDone) {
    return (
      <DiscoveryScreen
        onStartProcessing={async (files) => {
          if (files.length > 0) {
            persistentQueue.enqueue(files);
          }
          await AsyncStorage.setItem(AUTO_SCAN_KEY, JSON.stringify({ status: "complete", totalCount: files.length }));
          setAutoScanDone(true);
        }}
        onSkip={() => setAutoScanDone(true)}
      />
    );
  }

  return <AppNavigator />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
