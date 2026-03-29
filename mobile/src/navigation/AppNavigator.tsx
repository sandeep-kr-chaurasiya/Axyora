import { TouchableOpacity, Text } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { ChatScreen } from "../screens/ChatScreen";
import { ProcessingScreen } from "../screens/ProcessingScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { colors } from "../theme/colors";

export type RootStackParamList = {
  Processing: undefined;
  Chat: undefined;
  Settings: undefined;
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
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Processing"
        screenOptions={{
          headerStyle: { backgroundColor: colors.backgroundAlt },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          headerTitleStyle: { fontWeight: "800", fontSize: 18 },
        }}
      >
        <Stack.Screen
          name="Processing"
          options={({ navigation }) => ({ 
            title: "Neural Sync",
            headerRight: () => (
              <TouchableOpacity 
                onPress={() => navigation.navigate("Settings")}
                style={{ marginRight: 10 }}
              >
                <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 13 }}>SETTINGS</Text>
              </TouchableOpacity>
            )
          })} 
        >
          {({ navigation }) => <ProcessingScreen onDone={() => navigation.navigate("Chat")} />}
        </Stack.Screen>
        
        <Stack.Screen 
          name="Chat" 
          component={ChatScreen} 
          options={({ navigation }) => ({ 
            title: "Memory Chat",
            headerRight: () => (
              <TouchableOpacity 
                onPress={() => navigation.navigate("Settings")}
                style={{ marginRight: 10 }}
              >
                <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 13 }}>SETTINGS</Text>
              </TouchableOpacity>
            )
          })} 
        />
        
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen} 
          options={{ title: "Neural Engine Settings" }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
