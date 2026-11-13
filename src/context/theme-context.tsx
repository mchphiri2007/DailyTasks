
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    useContext,
    useEffect,
    useState,
} from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeColors = {
  background: string;
  card: string;
  text: string;
  secondaryText: string;
  primary: string;
  border: string;
  input: string;
  muted: string;
  header: string;
};

const lightColors: ThemeColors = {
  background: '#F5F7FB',
  card: '#FFFFFF',
  text: '#172554',
  secondaryText: '#64748B',
  primary: '#2563EB',
  border: '#E2E8F0',
  input: '#FFFFFF',
  muted: '#94A3B8',
  header: '#EAF0FA',
};

const darkColors: ThemeColors = {
  background: '#0F172A',
  card: '#1E293B',
  text: '#F8FAFC',
  secondaryText: '#CBD5E1',
  primary: '#60A5FA',
  border: '#334155',
  input: '#1E293B',
  muted: '#94A3B8',
  header: '#172554',
};

type ThemeContextType = {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => Promise<void>;
  colors: ThemeColors;
  isDark: boolean;
  isLoaded: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] =
    useState<ThemePreference>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem('daily_tasks_theme');

        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setPreferenceState(saved);
        }
      } catch (error) {
        console.log('Could not load theme preference:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadPreference();
  }, []);

  const setPreference = async (value: ThemePreference) => {
    setPreferenceState(value);

    try {
      await AsyncStorage.setItem('daily_tasks_theme', value);
    } catch (error) {
      console.log('Could not save theme preference:', error);
    }
  };

  const isDark =
    preference === 'system'
      ? systemScheme === 'dark'
      : preference === 'dark';

  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider
      value={{ preference, setPreference, colors, isDark, isLoaded }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }

  return context;
}
