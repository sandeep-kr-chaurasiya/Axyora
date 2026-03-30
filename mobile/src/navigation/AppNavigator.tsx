import { TouchableOpacity, Text, Platform } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ChatScreen } from "../screens/ChatScreen";
import { colors } from "../theme/colors";

export type RootStackParamList = {
  Chat: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.backgroundAlt,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

export function AppNavigator() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName="Chat"
          screenOptions={{
            headerStyle: { backgroundColor: colors.backgroundAlt },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
            headerTitleStyle: { fontWeight: "800", fontSize: 18 },
            headerShown: false,
            gestureEnabled: true,
            gestureDirection: "horizontal",
          }}
        >
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
