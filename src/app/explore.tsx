import { ThemePreference, useAppTheme } from '@/context/theme-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TASKS_STORAGE_KEY = 'my_tasks';
const BACKUP_APP_NAME = 'DailyTasks';
const BACKUP_VERSION = 1;

type Category = 'Education' | 'Work' | 'Personal' | 'Other';
type Priority = 'High' | 'Medium' | 'Low';
type RepeatOption = 'None' | 'Daily' | 'Weekly' | 'Monthly';

type Task = {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  category: Category;
  priority: Priority;
  dueDate?: string;
  reminderAt?: string;
  notificationId?: string;
  repeat?: RepeatOption;
};

type BackupFile = {
  app: string;
  backupVersion: number;
  createdAt: string;
  tasks: Task[];
};

const themeOptions: {
  value: ThemePreference;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    value: 'system',
    title: 'System Default',
    description: 'Automatically follow your phone settings.',
    icon: '📱',
  },
  {
    value: 'light',
    title: 'Light Mode',
    description: 'A clean, bright appearance.',
    icon: '☀️',
  },
  {
    value: 'dark',
    title: 'Dark Mode',
    description: 'A darker appearance that is easier on the eyes.',
    icon: '🌙',
  },
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidOptionalDate = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
};

/**
 * Validates the entire backup before any saved data is changed.
 */
function validateBackup(data: unknown): Task[] {
  if (!isObject(data)) {
    throw new Error('The selected file is not a valid DailyTasks backup.');
  }

  if (data.app !== BACKUP_APP_NAME) {
    throw new Error('This file was not created by DailyTasks.');
  }

  if (data.backupVersion !== BACKUP_VERSION) {
    throw new Error('This backup version is not supported.');
  }

  if (!Array.isArray(data.tasks)) {
    throw new Error('The backup does not contain a valid tasks list.');
  }

  const validCategories: Category[] = [
    'Education',
    'Work',
    'Personal',
    'Other',
  ];

  const validPriorities: Priority[] = ['High', 'Medium', 'Low'];

  const validRepeats: RepeatOption[] = [
    'None',
    'Daily',
    'Weekly',
    'Monthly',
  ];

  const seenIds = new Set<string>();

  const validatedTasks: Task[] = data.tasks.map(
    (item: unknown, index: number): Task => {
      if (!isObject(item)) {
        throw new Error(`Task ${index + 1} is invalid.`);
      }

      if (
        typeof item.id !== 'string' ||
        item.id.trim().length === 0 ||
        typeof item.title !== 'string' ||
        item.title.trim().length === 0
      ) {
        throw new Error(`Task ${index + 1} has an invalid ID or title.`);
      }

      if (seenIds.has(item.id)) {
        throw new Error(`Duplicate task ID found: ${item.id}`);
      }

      seenIds.add(item.id);

      if (typeof item.completed !== 'boolean') {
        throw new Error(`Task ${index + 1} has an invalid completion status.`);
      }

      if (
        item.notes !== undefined &&
        item.notes !== null &&
        typeof item.notes !== 'string'
      ) {
        throw new Error(`Task ${index + 1} has invalid notes.`);
      }

      if (
        item.category !== undefined &&
        !validCategories.includes(item.category as Category)
      ) {
        throw new Error(`Task ${index + 1} has an invalid category.`);
      }

      if (
        item.priority !== undefined &&
        !validPriorities.includes(item.priority as Priority)
      ) {
        throw new Error(`Task ${index + 1} has an invalid priority.`);
      }

      if (
        item.repeat !== undefined &&
        !validRepeats.includes(item.repeat as RepeatOption)
      ) {
        throw new Error(`Task ${index + 1} has an invalid repeat setting.`);
      }

      if (!isValidOptionalDate(item.dueDate)) {
        throw new Error(`Task ${index + 1} has an invalid due date.`);
      }

      if (!isValidOptionalDate(item.reminderAt)) {
        throw new Error(`Task ${index + 1} has an invalid reminder date.`);
      }

      return {
        id: item.id,
        title: item.title,
        notes: typeof item.notes === 'string' ? item.notes : '',
        completed: item.completed,
        category: (item.category as Category) || 'Personal',
        priority: (item.priority as Priority) || 'Medium',
        dueDate:
          typeof item.dueDate === 'string' ? item.dueDate : undefined,
        reminderAt:
          typeof item.reminderAt === 'string'
            ? item.reminderAt
            : undefined,

        // Notification IDs are generated by the device, not the backup.
        notificationId: undefined,

        repeat: (item.repeat as RepeatOption) || 'None',
      };
    },
  );

  return validatedTasks;
}

export default function SettingsScreen() {
  const { preference, setPreference, colors, isDark, isLoaded } =
    useAppTheme();

  const [isProcessingBackup, setIsProcessingBackup] = useState(false);

  const handleThemeChange = async (value: ThemePreference) => {
    await setPreference(value);
  };

  /**
   * EXPORT BACKUP
   * Reads the latest tasks directly from AsyncStorage.
   */
  
const handleExportBackup = async () => {
  try {
    setIsProcessingBackup(true);

    const storedTasks = await AsyncStorage.getItem('my_tasks');
    const tasks: Task[] = storedTasks ? JSON.parse(storedTasks) : [];

    if (!Array.isArray(tasks)) {
      throw new Error('Your saved tasks could not be read correctly.');
    }

    const backup: BackupFile = {
      app: 'DailyTasks',
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      tasks: tasks.map((task) => ({
        ...task,
        notificationId: undefined,
      })),
    };

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');

    const fileName = `DailyTasks-Backup-${timestamp}.json`;

    // Open Android's folder picker.
    const permission =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission required',
        'Please select a folder to save your backup.',
      );
      return;
    }

    // Create the JSON file in the selected folder.
    const fileUri =
      await FileSystem.StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        fileName,
        'application/json',
      );

    // Write the backup contents.
    await FileSystem.writeAsStringAsync(
      fileUri,
      JSON.stringify(backup, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 },
    );

    Alert.alert(
      'Backup successful!',
      `Your ${tasks.length} tasks have been backed up successfully.\n\nFile: ${fileName}\n\nYou can find it in the folder you selected.`,
    );

  } catch (error) {
    console.error('Backup export error:', error);

    Alert.alert(
      'Backup failed',
      error instanceof Error
        ? error.message
        : 'Something went wrong while creating your backup.',
    );
  } finally {
    setIsProcessingBackup(false);
  }
};


  /**
   * RESTORE BACKUP
   * Opens the phone's document picker and validates the selected file.
   */
  const handleRestoreBackup = async () => {
    try {
      setIsProcessingBackup(true);

      const result = await File.pickFileAsync({
  mimeTypes: ['application/json', 'text/plain'],
});

if (result.canceled) {
  return;
}

const selectedFile = result.result;

if (selectedFile.size > 10 * 1024 * 1024) {
  throw new Error('Backup file is too large. Maximum size is 10 MB.');
}

const fileContents = await selectedFile.text();

let parsedBackup: unknown;

try {
  parsedBackup = JSON.parse(fileContents);
} catch {
  throw new Error('The selected file is not valid JSON.');
}

const restoredTasks = validateBackup(parsedBackup);

      // Validate every task before asking to replace anything.
     

      setIsProcessingBackup(false);

      Alert.alert(
        'Restore backup?',
        `This backup contains ${restoredTasks.length} ${
          restoredTasks.length === 1 ? 'task' : 'tasks'
        }.\n\nRestoring it will replace all your currently saved tasks. This action cannot be undone.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: () => {
              void performRestore(restoredTasks);
            },
          },
        ],
      );

    } catch (error) {
      console.error('Backup import error:', error);

      Alert.alert(
        'Restore failed',
        error instanceof Error
          ? error.message
          : 'The backup could not be restored.',
      );
    } finally {
      setIsProcessingBackup(false);
    }
  };

  /**
   * Saves the validated tasks first.
   * Then creates fresh notification IDs for future reminders.
   */
  const performRestore = async (restoredTasks: Task[]) => {
    try {
      setIsProcessingBackup(true);

      const oldStoredTasks = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
      const oldTasks: Task[] = oldStoredTasks
        ? JSON.parse(oldStoredTasks)
        : [];

      const tasksWithoutNotificationIds = restoredTasks.map((task) => ({
        ...task,
        notificationId: undefined,
      }));

      // Keep track of newly created notifications in case saving fails.
      const newNotificationIds: string[] = [];

      const permissions = await Notifications.getPermissionsAsync();
      const canScheduleNotifications = permissions.granted;

      const tasksWithNewNotifications: Task[] = [];

      for (const task of tasksWithoutNotificationIds) {
        let notificationId: string | undefined;

        if (
          canScheduleNotifications &&
          !task.completed &&
          task.reminderAt &&
          Date.parse(task.reminderAt) > Date.now()
        ) {
          try {
            notificationId = await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Task Reminder',
                body: task.title,
                data: { taskId: task.id },
              },
              trigger: new Date(task.reminderAt),
            });

            newNotificationIds.push(notificationId);
          } catch (notificationError) {
            // The task and reminder date are still restored even if
            // the device cannot schedule this particular notification.
            console.warn(
              'Could not recreate reminder for task:',
              task.id,
              notificationError,
            );
          }
        }

        tasksWithNewNotifications.push({
          ...task,
          notificationId,
        });
      }

      try {
        await AsyncStorage.setItem(
          TASKS_STORAGE_KEY,
          JSON.stringify(tasksWithNewNotifications),
        );
      } catch (storageError) {
        // Do not leave newly scheduled notifications behind if saving fails.
        await Promise.all(
          newNotificationIds.map((id) =>
            Notifications.cancelScheduledNotificationAsync(id).catch(
              () => undefined,
            ),
          ),
        );

        throw storageError;
      }

      // Only cancel the old task reminders after the new tasks are saved.
      for (const oldTask of oldTasks) {
        if (oldTask.notificationId) {
          try {
            await Notifications.cancelScheduledNotificationAsync(
              oldTask.notificationId,
            );
          } catch (error) {
            console.warn('Could not cancel an old task reminder:', error);
          }
        }
      }

      // Tell the task screen to reload its data from AsyncStorage.
      DeviceEventEmitter.emit('dailyTasksUpdated');

      Alert.alert(
        'Backup restored',
        `${tasksWithNewNotifications.length} ${
          tasksWithNewNotifications.length === 1 ? 'task has' : 'tasks have'
        } been restored successfully.`,
      );

    } catch (error) {
      console.error('Restore operation error:', error);

      Alert.alert(
        'Restore failed',
        error instanceof Error
          ? error.message
          : 'Your backup could not be restored.',
      );
    } finally {
      setIsProcessingBackup(false);
    }
  };

  if (!isLoaded) {
    return (
      <SafeAreaView
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text }]}>
            Settings
          </Text>

          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            Personalise your DailyTasks experience.
          </Text>
        </View>

        {/* APPEARANCE SECTION */}

        <View
          style={[
            styles.section,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionIcon}>🎨</Text>

            <View style={styles.sectionHeadingText}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Appearance
              </Text>

              <Text
                style={[
                  styles.sectionDescription,
                  { color: colors.secondaryText },
                ]}
              >
                Choose how DailyTasks looks on your device.
              </Text>
            </View>
          </View>

          <View style={styles.optionsContainer}>
            {themeOptions.map((option) => {
              const selected = preference === option.value;

              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.75}
                  onPress={() => handleThemeChange(option.value)}
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor: selected
                        ? isDark
                          ? '#263B59'
                          : '#EFF6FF'
                        : colors.background,
                      borderColor: selected
                        ? colors.primary
                        : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.optionIcon}>{option.icon}</Text>

                  <View style={styles.optionTextContainer}>
                    <Text
                      style={[styles.optionTitle, { color: colors.text }]}
                    >
                      {option.title}
                    </Text>

                    <Text
                      style={[
                        styles.optionDescription,
                        { color: colors.secondaryText },
                      ]}
                    >
                      {option.description}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.radioOuter,
                      {
                        borderColor: selected
                          ? colors.primary
                          : colors.muted,
                      },
                    ]}
                  >
                    {selected && (
                      <View
                        style={[
                          styles.radioInner,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* BACKUP AND RESTORE SECTION */}

        <View
          style={[
            styles.section,
            styles.backupSection,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionIcon}>💾</Text>

            <View style={styles.sectionHeadingText}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Backup & Restore
              </Text>

              <Text
                style={[
                  styles.sectionDescription,
                  { color: colors.secondaryText },
                ]}
              >
                Keep your tasks safe and move them between devices.
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.backupInfo,
              {
                backgroundColor: isDark ? '#1D3441' : '#EFFAF5',
                borderColor: isDark ? '#315263' : '#D2F0E0',
              },
            ]}
          >
            <Text style={styles.backupInfoIcon}>🔒</Text>

            <Text
              style={[
                styles.backupInfoText,
                { color: colors.text },
              ]}
            >
              Your backups are stored locally or saved using your phone's
              sharing options. No internet connection is required.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isProcessingBackup}
            onPress={handleExportBackup}
            style={[
              styles.backupButton,
              { backgroundColor: colors.primary },
              isProcessingBackup && styles.disabledButton,
            ]}
          >
            <Text style={styles.backupButtonIcon}>📤</Text>

            <View style={styles.backupButtonText}>
              <Text style={styles.backupButtonTitle}>
                Export Backup
              </Text>

              <Text style={styles.backupButtonDescription}>
                Save all your tasks and notes to a backup file.
              </Text>
            </View>

            <Text style={styles.backupArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            disabled={isProcessingBackup}
            onPress={handleRestoreBackup}
            style={[
              styles.backupButton,
              {
                backgroundColor: isDark ? '#263B59' : '#EFF6FF',
                borderColor: colors.border,
                borderWidth: 1,
              },
              isProcessingBackup && styles.disabledButton,
            ]}
          >
            <Text style={styles.backupButtonIcon}>📥</Text>

            <View style={styles.backupButtonText}>
              <Text
                style={[
                  styles.restoreButtonTitle,
                  { color: colors.text },
                ]}
              >
                Restore Backup
              </Text>

              <Text
                style={[
                  styles.restoreButtonDescription,
                  { color: colors.secondaryText },
                ]}
              >
                Select a previous backup and restore your tasks.
              </Text>
            </View>

            <Text
              style={[
                styles.backupArrow,
                { color: colors.text },
              ]}
            >
              ›
            </Text>
          </TouchableOpacity>

          {isProcessingBackup && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />

              <Text
                style={[
                  styles.processingText,
                  { color: colors.secondaryText },
                ]}
              >
                Processing your backup...
              </Text>
            </View>
          )}
        </View>

        {/* APPEARANCE INFORMATION */}

        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={styles.infoIcon}>💡</Text>

          <View style={styles.infoTextContainer}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>
              Your preference is saved
            </Text>

            <Text
              style={[
                styles.infoDescription,
                { color: colors.secondaryText },
              ]}
            >
              Your selected appearance will remain active when you close and
              reopen DailyTasks.
            </Text>
          </View>
        </View>

        <Text style={[styles.footer, { color: colors.muted }]}>
          DAILY TASKS · STAY ORGANISED · STAY PRODUCTIVE
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 30,
  },
  header: {
    marginBottom: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 6,
  },
  section: {
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    elevation: 2,
  },
  backupSection: {
    marginTop: 18,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 19,
  },
  sectionIcon: {
    fontSize: 25,
    marginRight: 12,
  },
  sectionHeadingText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  sectionDescription: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  optionsContainer: {
    gap: 11,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 13,
  },
  optionIcon: {
    fontSize: 23,
    marginRight: 12,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  optionDescription: {
    fontSize: 10,
    marginTop: 4,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  backupInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 11,
    borderWidth: 1,
    padding: 12,
    marginBottom: 15,
  },
  backupInfoIcon: {
    fontSize: 18,
    marginRight: 9,
  },
  backupInfoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
  backupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  backupButtonIcon: {
    fontSize: 23,
    marginRight: 12,
  },
  backupButtonText: {
    flex: 1,
  },
  backupButtonTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  backupButtonDescription: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
    opacity: 0.9,
  },
  restoreButtonTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  restoreButtonDescription: {
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  backupArrow: {
    color: '#FFFFFF',
    fontSize: 27,
    marginLeft: 8,
    fontWeight: '300',
  },
  disabledButton: {
    opacity: 0.55,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 17,
    gap: 9,
  },
  processingText: {
    fontSize: 11,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    padding: 15,
    marginTop: 18,
  },
  infoIcon: {
    fontSize: 22,
    marginRight: 11,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  infoDescription: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  footer: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 30,
  },
});