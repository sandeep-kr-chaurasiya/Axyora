import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "./src/hooks/useAuth";
import { useAppLifecycle } from "./src/hooks/useAppLifecycle";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthScreen } from "./src/screens/AuthScreen";
import { EnhancedOnboardingScreen } from "./src/screens/EnhancedOnboardingScreen";
import { EnhancedPermissionsScreen } from "./src/screens/EnhancedPermissionsScreen";
import { AutoIndexingScreen } from "./src/screens/AutoIndexingScreen";
import { SplashScreen } from "./src/screens/SplashScreen";
import { colors } from "./src/theme/colors";

const ONBOARDING_KEY = "@axyora/onboarding-complete";
const PERMISSIONS_KEY = "@axyora/permissions-granted";
const AUTO_SCAN_KEY = "@axyora_auto_scan_state";

export default function App() {
  const { user, loading, signIn, signUp } = useAuth();
  // Initialize app lifecycle (permissions, queue persistence, app state monitoring)
  useAppLifecycle();

  const [showSplash, setShowSplash] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [permissionsDone, setPermissionsDone] = useState(false);
  const [autoScanDone, setAutoScanDone] = useState(false);
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
      if (!alive) {
        return;
      }
      setOnboardingDone(onboarding === "1");
      setPermissionsDone(perms === "1");
      
      // Mark auto scan as done if it completed successfully
      if (autoScan) {
        try {
          const state = JSON.parse(autoScan);
          setAutoScanDone(state.status === "complete");
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

  if (showSplash) {
    return <SplashScreen />;
  }

  if (loading || bootLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!onboardingDone) {
    return (
      <EnhancedOnboardingScreen
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
      />
    );
  }

  if (!autoScanDone) {
    return (
      <AutoIndexingScreen
        onComplete={async () => {
          setAutoScanDone(true);
        }}
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
