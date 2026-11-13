
import { DarkTheme, DefaultTheme, ThemeProvider as RouterThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { ThemeProvider, useAppTheme } from '@/context/theme-context';

SplashScreen.preventAutoHideAsync();

function AppLayoutContent() {
  const { isDark, isLoaded } = useAppTheme();

  if (!isLoaded) {
    return null;
  }

  return (
    <RouterThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </RouterThemeProvider>
  );
}

export default function TabLayout() {
  return (
    <ThemeProvider>
      <AppLayoutContent />
    </ThemeProvider>
  );
}
