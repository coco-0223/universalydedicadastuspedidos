
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: 'welcome',
};

import { AppProvider } from '@/src/context/AppContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      // Dejamos que index.tsx oculte el splash al tener el video listo
      setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {});
      }, 5000); // Fail-safe fallback
    }
  }, [loaded]);



  if (!loaded) {
    return null;
  }

  return (
    <AppProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="welcome" options={{ title: 'Role Selection', headerShown: false }} />
          <Stack.Screen name="(store)/(client)" options={{ headerShown: false }} />
          <Stack.Screen name="business-auth" options={{ title: 'Business Login', headerShown: false }} />
          <Stack.Screen name="(business)" options={{ headerShown: false }} />
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </ThemeProvider>
    </AppProvider>
  );
}

