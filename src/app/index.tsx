
import { useAppTheme } from '@/context/theme-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type Category = 'Education' | 'Work' | 'Personal' | 'Other';
type Priority = 'High' | 'Medium' | 'Low';
type SortOption = 'Newest first' | 'Oldest first' | 'Due date' | 'Priority';
type RepeatOption = 'None' | 'Daily' | 'Weekly' | 'Monthly';

type Task = {
  id: string;
  title: string;
  completed: boolean;
  category: Category;
  priority: Priority;
  dueDate?: string;
  reminderAt?: string;
  notificationId?: string;
  repeat?: RepeatOption;
};

const categories: Category[] = ['Education', 'Work', 'Personal', 'Other'];
const priorities: Priority[] = ['High', 'Medium', 'Low'];
const repeatOptions: RepeatOption[] = ['None', 'Daily', 'Weekly', 'Monthly'];

const filters = [
  'All', 'Pending', 'Completed', 'Today', 'Upcoming', 'Overdue',
  ...categories,
];

const sortOptions: SortOption[] = [
  'Newest first', 'Oldest first', 'Due date', 'Priority',
];

export default function HomeScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = createStyles(isDark);
  const [task, setTask] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [category, setCategory] = useState<Category>('Personal');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [repeat, setRepeat] = useState<RepeatOption>('None');

  const [filter, setFilter] = useState('All');
  const [sortOption, setSortOption] = useState<SortOption>('Newest first');
  const [searchQuery, setSearchQuery] = useState('');

  const [isLoaded, setIsLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [dueDate, setDueDate] = useState<Date | null>(null);

  const [reminderTime, setReminderTime] = useState(() => {
    const time = new Date();
    time.setHours(9, 0, 0, 0);
    return time;
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const isSameDay = (first: Date, second: Date) =>
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();

  const isToday = (item: Task) => {
    if (!item.dueDate) return false;
    const due = new Date(item.dueDate);
    return !Number.isNaN(due.getTime()) && isSameDay(due, new Date());
  };

  const isOverdue = (item: Task) => {
    if (!item.dueDate || item.completed) return false;
    const due = new Date(item.dueDate);
    if (Number.isNaN(due.getTime())) return false;

    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  };

  const isUpcoming = (item: Task) => {
    if (!item.dueDate || item.completed) return false;
    const due = new Date(item.dueDate);
    if (Number.isNaN(due.getTime())) return false;

    const today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return due.getTime() > today.getTime();
  };

  const getNextOccurrence = (
    originalDate: Date,
    repeatType: RepeatOption
  ): Date => {
    const next = new Date(originalDate);

    if (repeatType === 'Daily') {
      next.setDate(next.getDate() + 1);
    } else if (repeatType === 'Weekly') {
      next.setDate(next.getDate() + 7);
    } else if (repeatType === 'Monthly') {
      const originalDay = next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);

      const lastDay = new Date(
        next.getFullYear(),
        next.getMonth() + 1,
        0
      ).getDate();

      next.setDate(Math.min(originalDay, lastDay));
    }

    return next;
  };

  // Save a complete task list and report whether saving succeeded.
  const saveTasks = async (updatedTasks: Task[]): Promise<boolean> => {
    try {
      await AsyncStorage.setItem('my_tasks', JSON.stringify(updatedTasks));
      return true;
    } catch (error) {
      console.log('Task storage failed:', error);
      return false;
    }
  };

  // Safely cancel a scheduled notification.
  const cancelTaskReminder = async (notificationId?: string) => {
    if (!notificationId) return;

    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('Reminder cancelled:', notificationId);
    } catch (error) {
      console.log('Could not cancel reminder:', error);
    }
  };

  // Load saved tasks.
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const savedTasks = await AsyncStorage.getItem('my_tasks');

        if (savedTasks) {
          const parsedTasks = JSON.parse(savedTasks);

          if (Array.isArray(parsedTasks)) {
            const updatedTasks: Task[] = parsedTasks.map((item: any) => ({
              ...item,
              category: item.category || 'Personal',
              priority: item.priority || 'Medium',
              repeat: item.repeat || 'None',
            }));

            setTasks(updatedTasks);
          }
        }
      } catch (error) {
        console.log('Error loading tasks:', error);
        Alert.alert(
          'Loading problem',
          'Your saved tasks could not be loaded. Please try reopening the app.'
        );
      } finally {
        setIsLoaded(true);
      }
    };

    loadTasks();
  }, []);

  // Save task changes automatically.
  useEffect(() => {
    if (!isLoaded) return;

    AsyncStorage.setItem('my_tasks', JSON.stringify(tasks)).catch((error) => {
      console.log('Error saving tasks:', error);
    });
  }, [tasks, isLoaded]);

  // Schedule a local notification.
  const scheduleTaskReminder = async (
    title: string,
    reminderDate: Date
  ): Promise<string | undefined> => {
    try {
      if (
        Number.isNaN(reminderDate.getTime()) ||
        reminderDate.getTime() <= Date.now()
      ) {
        console.log('Reminder date must be in the future.');
        return undefined;
      }

      const permission = await Notifications.getPermissionsAsync();
      let finalStatus = permission.status;

      if (finalStatus !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested.status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permission was not granted.');
        return undefined;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'DailyTasks Reminder 🔔',
          body: `Remember to complete: ${title}`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderDate,
        },
      });

      console.log('Notification scheduled:', notificationId);
      return notificationId;
    } catch (error) {
      console.log('Notification scheduling failed:', error);
      return undefined;
    }
  };

  const resetForm = () => {
    setEditingTaskId(null);
    setTask('');
    setCategory('Personal');
    setPriority('Medium');
    setRepeat('None');
    setDueDate(null);

    const defaultTime = new Date();
    defaultTime.setHours(9, 0, 0, 0);
    setReminderTime(defaultTime);

    setShowCreateForm(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
    Keyboard.dismiss();
  };

  const editTask = (item: Task) => {
    setEditingTaskId(item.id);
    setTask(item.title);
    setCategory(item.category);
    setPriority(item.priority);
    setRepeat(item.repeat || 'None');
    setDueDate(item.dueDate ? new Date(item.dueDate) : null);

    if (item.reminderAt) {
      setReminderTime(new Date(item.reminderAt));
    } else {
      const defaultTime = new Date();
      defaultTime.setHours(9, 0, 0, 0);
      setReminderTime(defaultTime);
    }

    setShowCreateForm(true);
    setShowDatePicker(false);
    setShowTimePicker(false);
    Keyboard.dismiss();
  };

  const cancelEditing = () => resetForm();

  // Update task first, then replace its old notification.
  const updateTask = async (
    taskTitle: string,
    reminderAt: Date | null
  ) => {
    const existingTask = tasks.find((item) => item.id === editingTaskId);

    if (!existingTask) {
      Alert.alert('Task not found', 'This task could not be found.');
      return;
    }

    let newNotificationId: string | undefined;

    if (reminderAt) {
      newNotificationId = await scheduleTaskReminder(taskTitle, reminderAt);
    }

    const updatedTask: Task = {
      ...existingTask,
      title: taskTitle,
      category,
      priority,
      repeat,
      dueDate: dueDate?.toISOString(),
      reminderAt: reminderAt?.toISOString(),
      notificationId: newNotificationId,
    };

    const updatedTasks = tasks.map((item) =>
      item.id === editingTaskId ? updatedTask : item
    );

    const saved = await saveTasks(updatedTasks);

    if (!saved) {
      await cancelTaskReminder(newNotificationId);

      Alert.alert(
        'Storage problem',
        'Your changes could not be saved. Your previous task and reminder have been kept.'
      );
      return;
    }

    setTasks(updatedTasks);

    // Only cancel the old reminder after the new task has been saved.
    if (existingTask.notificationId) {
      await cancelTaskReminder(existingTask.notificationId);
    }

    resetForm();

    if (reminderAt && !newNotificationId) {
      Alert.alert(
        'Task updated',
        'Your task was updated, but its new reminder could not be scheduled. Check notification permissions.'
      );
    } else {
      Alert.alert(
        'Task updated!',
        'Your changes and reminder have been saved successfully.'
      );
    }
  };

  // Add a new task or update an existing task.
  const addTask = async () => {
    const taskTitle = task.trim();

    if (!taskTitle) {
      Alert.alert('Missing task', 'Please enter a task name.');
      return;
    }

    if (isAdding) return;

    if (repeat !== 'None' && !dueDate) {
      Alert.alert(
        'Due date required',
        'Please choose a due date for a recurring task.'
      );
      return;
    }

    let reminderAt: Date | null = null;

    if (dueDate) {
      reminderAt = new Date(dueDate);
      reminderAt.setHours(
        reminderTime.getHours(),
        reminderTime.getMinutes(),
        0,
        0
      );

      if (reminderAt.getTime() <= Date.now()) {
        Alert.alert(
          'Invalid reminder',
          'Please select a future date and time.'
        );
        return;
      }
    }

    setIsAdding(true);

    if (editingTaskId) {
      await updateTask(taskTitle, reminderAt);
      setIsAdding(false);
      return;
    }

    const newTask: Task = {
      id: Date.now().toString(),
      title: taskTitle,
      completed: false,
      category,
      priority,
      repeat,
      dueDate: dueDate?.toISOString(),
      reminderAt: reminderAt?.toISOString(),
    };

    const updatedTasks = [newTask, ...tasks];
    const saved = await saveTasks(updatedTasks);

    if (!saved) {
      Alert.alert(
        'Storage problem',
        'The task could not be saved to phone storage. Please try again.'
      );
      setIsAdding(false);
      return;
    }

    setTasks(updatedTasks);
    resetForm();

    if (reminderAt) {
      const notificationId = await scheduleTaskReminder(taskTitle, reminderAt);

      if (notificationId) {
        const tasksWithReminder = updatedTasks.map((item) =>
          item.id === newTask.id ? { ...item, notificationId } : item
        );

        const reminderSaved = await saveTasks(tasksWithReminder);

        if (reminderSaved) {
          setTasks(tasksWithReminder);
          Alert.alert(
            'Task saved!',
            'Your task and reminder have been saved successfully.'
          );
        } else {
          // Avoid leaving a notification that is not recorded in storage.
          await cancelTaskReminder(notificationId);
          Alert.alert(
            'Task saved',
            'Your task was saved, but its reminder could not be recorded. Please edit the task to set its reminder again.'
          );
        }
      } else {
        Alert.alert(
          'Task saved, reminder not set',
          'Your task and due date have been saved, but the phone could not schedule its reminder. Check notification permissions.'
        );
      }
    } else {
      Alert.alert('Task saved!', 'Your task has been added.');
    }

    setIsAdding(false);
  };

  // Complete a task, cancel its old reminder and create the next occurrence.
  const toggleTask = async (id: string) => {
    const selectedTask = tasks.find((item) => item.id === id);
    if (!selectedTask) return;

    // Reopening a completed task: save it first, then restore its reminder
    // if the original reminder time is still in the future.
    if (selectedTask.completed) {
      const reopenedTask: Task = {
        ...selectedTask,
        completed: false,
        notificationId: undefined,
      };

      const reopenedTasks = tasks.map((item) =>
        item.id === id ? reopenedTask : item
      );

      const saved = await saveTasks(reopenedTasks);

      if (!saved) {
        Alert.alert(
          'Storage problem',
          'The task could not be reopened. Please try again.'
        );
        return;
      }

      setTasks(reopenedTasks);

      if (selectedTask.reminderAt) {
        const reminderDate = new Date(selectedTask.reminderAt);

        if (reminderDate.getTime() > Date.now()) {
          const newNotificationId = await scheduleTaskReminder(
            selectedTask.title,
            reminderDate
          );

          if (newNotificationId) {
            const tasksWithReminder = reopenedTasks.map((item) =>
              item.id === id
                ? { ...item, notificationId: newNotificationId }
                : item
            );

            if (await saveTasks(tasksWithReminder)) {
              setTasks(tasksWithReminder);
            } else {
              await cancelTaskReminder(newNotificationId);
            }
          }
        }
      }

      return;
    }

    const completedTask: Task = {
      ...selectedTask,
      completed: true,
      notificationId: undefined,
    };

    let updatedTasks = tasks.map((item) =>
      item.id === id ? completedTask : item
    );

    const repeatType = selectedTask.repeat || 'None';
    let nextTask: Task | undefined;

    if (repeatType !== 'None') {
      const baseDate = selectedTask.dueDate
        ? new Date(selectedTask.dueDate)
        : new Date();

      const nextDueDate = getNextOccurrence(baseDate, repeatType);

      let nextReminderDate: Date | undefined;

      if (selectedTask.reminderAt) {
        const previousReminder = new Date(selectedTask.reminderAt);
        nextReminderDate = getNextOccurrence(previousReminder, repeatType);
      }

      nextTask = {
        ...selectedTask,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        completed: false,
        dueDate: nextDueDate.toISOString(),
        reminderAt: nextReminderDate?.toISOString(),
        notificationId: undefined,
      };

      updatedTasks = [nextTask, ...updatedTasks];
    }

    // Save completion and next occurrence before changing notifications.
    const saved = await saveTasks(updatedTasks);

    if (!saved) {
      Alert.alert(
        'Storage problem',
        'The task completion could not be saved. Its existing reminder has been kept.'
      );
      return;
    }

    setTasks(updatedTasks);

    // The old occurrence is now safely saved as completed.
    await cancelTaskReminder(selectedTask.notificationId);

    // Schedule the reminder for the next recurring occurrence.
    if (nextTask?.reminderAt) {
      const nextReminderDate = new Date(nextTask.reminderAt);

      const notificationId = await scheduleTaskReminder(
        nextTask.title,
        nextReminderDate
      );

      if (notificationId) {
        const tasksWithReminder = updatedTasks.map((item) =>
          item.id === nextTask!.id
            ? { ...item, notificationId }
            : item
        );

        if (await saveTasks(tasksWithReminder)) {
          setTasks(tasksWithReminder);
        } else {
          await cancelTaskReminder(notificationId);
          Alert.alert(
            'Reminder not saved',
            'The next task was created, but its reminder could not be saved. Please edit the next task to set a reminder.'
          );
        }
      } else {
        Alert.alert(
          'Next task created',
          'The next occurrence was created, but its reminder could not be scheduled.'
        );
      }
    }

    if (repeatType !== 'None') {
      Alert.alert(
        'Task completed!',
        `Your next ${repeatType.toLowerCase()} occurrence has been created.`
      );
    }
  };

  // Delete task from storage first, then cancel its reminder.
  const deleteTask = async (id: string) => {
    const selectedTask = tasks.find((item) => item.id === id);
    if (!selectedTask) return;

    const updatedTasks = tasks.filter((item) => item.id !== id);
    const saved = await saveTasks(updatedTasks);

    if (!saved) {
      Alert.alert(
        'Storage problem',
        'The task could not be deleted. Please try again.'
      );
      return;
    }

    setTasks(updatedTasks);
    await cancelTaskReminder(selectedTask.notificationId);

    if (editingTaskId === id) {
      resetForm();
    }
  };

  // Dashboard statistics.
  const completedCount = tasks.filter((item) => item.completed).length;
  const overdueCount = tasks.filter((item) => isOverdue(item)).length;
  const todayCount = tasks.filter((item) => isToday(item)).length;
  const upcomingCount = tasks.filter((item) => isUpcoming(item)).length;

  const progress = tasks.length === 0
    ? 0
    : Math.round((completedCount / tasks.length) * 100);

  // Apply search and filters.
  const filteredTasks = tasks.filter((item) => {
    const matchesSearch = item.title
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());

    let matchesFilter = false;

    if (filter === 'All') matchesFilter = true;
    else if (filter === 'Pending') matchesFilter = !item.completed;
    else if (filter === 'Completed') matchesFilter = item.completed;
    else if (filter === 'Today') matchesFilter = isToday(item);
    else if (filter === 'Upcoming') matchesFilter = isUpcoming(item);
    else if (filter === 'Overdue') matchesFilter = isOverdue(item);
    else matchesFilter = item.category === filter;

    return matchesSearch && matchesFilter;
  });

  // Apply sorting.
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortOption === 'Newest first') {
      return Number(b.id.split('-')[0]) - Number(a.id.split('-')[0]);
    }

    if (sortOption === 'Oldest first') {
      return Number(a.id.split('-')[0]) - Number(b.id.split('-')[0]);
    }

    if (sortOption === 'Due date') {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }

    if (sortOption === 'Priority') {
      const priorityOrder: Record<Priority, number> = {
        High: 1,
        Medium: 2,
        Low: 3,
      };

      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }

    return 0;
  });

  const getPriorityColor = (value: Priority) => {
    if (value === 'High') return '#EF4444';
    if (value === 'Medium') return '#F59E0B';
    return '#16A34A';
  };

  const getEmptyTitle = () => {
    if (filter === 'Overdue') return 'No overdue tasks';
    if (filter === 'Today') return 'No tasks due today';
    if (filter === 'Upcoming') return 'No upcoming tasks';
    if (searchQuery) return 'No matching tasks';
    return 'No tasks found';
  };

  const getEmptyMessage = () => {
    if (filter === 'Overdue') return 'Great! You are up to date with your tasks.';
    if (filter === 'Today') return 'You have no tasks scheduled for today.';
    if (filter === 'Upcoming') return 'You have no pending tasks scheduled for future dates.';
    if (searchQuery) return 'Try another task name or clear your search.';
    return 'Add a task or choose another filter.';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <Text style={styles.greeting}>YOUR PERSONAL PLANNER</Text>
        <Text style={styles.heading}>DailyTasks</Text>
        <Text style={styles.subtitle}>Plan your day. Achieve your goals.</Text>
      </View>

      {/* Compact dashboard: statistics and progress in one card */}
      <View style={styles.summary}>
        <View style={styles.summaryStats}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>TOTAL TASKS</Text>
            <Text style={styles.summaryNumber}>{tasks.length}</Text>
            <Text style={styles.summaryDescription}>All tasks</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>COMPLETED</Text>
            <Text style={styles.summaryNumber}>{completedCount}</Text>
            <Text style={styles.summaryDescription}>Finished tasks</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>OVERDUE</Text>
            <Text style={[
              styles.summaryNumber,
              overdueCount > 0 && styles.overdueNumber,
            ]}>
              {overdueCount}
            </Text>
            <Text style={styles.summaryDescription}>Past due date</Text>
          </View>
        </View>

        <View style={styles.summaryProgress}>
          <View style={styles.progressHeading}>
            <Text style={styles.progressTitle}>Overall progress</Text>
            <Text style={styles.progressPercentage}>{progress}%</Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%` },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Create task heading */}
      <TouchableOpacity
        style={styles.createTaskHeader}
        onPress={() => {
          if (editingTaskId) cancelEditing();
          else setShowCreateForm(!showCreateForm);
        }}
      >
        <Text style={styles.sectionTitle}>
          {editingTaskId ? 'Edit task' : 'Create a task'}
        </Text>
        <Text style={styles.toggleText}>
          {showCreateForm ? '− Close' : '+ Add task'}
        </Text>
      </TouchableOpacity>

      {/* Create / edit form */}
      {showCreateForm && (
        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="What do you need to do?"
              placeholderTextColor={colors.muted}
              value={task}
              onChangeText={setTask}
              onSubmitEditing={addTask}
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[styles.addButton, isAdding && { opacity: 0.5 }]}
              onPress={addTask}
              disabled={isAdding}
            >
              <Text style={styles.addButtonText}>
                {isAdding ? '...' : editingTaskId ? '✓' : '+'}
              </Text>
            </TouchableOpacity>
          </View>

          {editingTaskId && (
            <TouchableOpacity
              style={styles.cancelEditButton}
              onPress={cancelEditing}
            >
              <Text style={styles.cancelEditText}>Cancel editing</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.smallHeading}>Choose category</Text>
          <View style={styles.optionRow}>
            {categories.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setCategory(item)}
                style={[
                  styles.optionButton,
                  category === item && styles.selectedOption,
                ]}
              >
                <Text style={[
                  styles.optionText,
                  category === item && styles.selectedOptionText,
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.smallHeading}>Set priority</Text>
          <View style={styles.priorityRow}>
            {priorities.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setPriority(item)}
                style={[
                  styles.priorityButton,
                  priority === item && {
                    borderColor: getPriorityColor(item),
                    backgroundColor: `${getPriorityColor(item)}15`,
                  },
                ]}
              >
                <View style={[
                  styles.priorityDot,
                  { backgroundColor: getPriorityColor(item) },
                ]} />
                <Text style={[
                  styles.priorityText,
                  priority === item && {
                    color: getPriorityColor(item),
                    fontWeight: '800',
                  },
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.smallHeading}>Repeat task</Text>
          <View style={styles.repeatRow}>
            {repeatOptions.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setRepeat(item)}
                style={[
                  styles.repeatButton,
                  repeat === item && styles.selectedRepeatButton,
                ]}
              >
                <Text style={[
                  styles.repeatButtonText,
                  repeat === item && styles.selectedRepeatText,
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {repeat !== 'None' && (
            <Text style={styles.repeatHint}>
              This task will create its next occurrence when you complete it.
              Choose a due date below.
            </Text>
          )}

          <Text style={styles.smallHeading}>Set due date</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>
              📅 {dueDate ? dueDate.toLocaleDateString() : 'Choose due date'}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={dueDate || new Date()}
              mode="date"
              minimumDate={new Date()}
              display="default"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) setDueDate(selectedDate);
              }}
            />
          )}

          {dueDate && (
            <>
              <Text style={styles.smallHeading}>Set reminder time</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.dateButtonText}>
                  🔔 {reminderTime.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </TouchableOpacity>

              {showTimePicker && (
                <DateTimePicker
                  value={reminderTime}
                  mode="time"
                  display="default"
                  onChange={(event, selectedTime) => {
                    setShowTimePicker(false);
                    if (selectedTime) setReminderTime(selectedTime);
                  }}
                />
              )}
            </>
          )}
        </View>
      )}

      <Text style={styles.taskListHeading}>My task list</Text>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search your tasks..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.clearSearchButton}
            onPress={() => setSearchQuery('')}
          >
            <Text style={styles.clearSearchText}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {filters.map((item) => (
          <TouchableOpacity
            key={item}
            onPress={() => setFilter(item)}
            style={[
              styles.filterButton,
              filter === item && styles.activeFilter,
              item === 'Overdue' && filter !== 'Overdue' && styles.overdueFilterButton,
              item === 'Today' && filter !== 'Today' && styles.todayFilterButton,
              item === 'Upcoming' && filter !== 'Upcoming' && styles.upcomingFilterButton,
            ]}
          >
            <Text style={[
              styles.filterText,
              filter === item && styles.activeFilterText,
              item === 'Overdue' && filter !== 'Overdue' && styles.overdueFilterText,
              item === 'Today' && filter !== 'Today' && styles.todayFilterText,
              item === 'Upcoming' && filter !== 'Upcoming' && styles.upcomingFilterText,
            ]}>
              {item}
              {item === 'Overdue' ? ` (${overdueCount})` : ''}
              {item === 'Today' ? ` (${todayCount})` : ''}
              {item === 'Upcoming' ? ` (${upcomingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sorting */}
      <View style={styles.sortSection}>
        <Text style={styles.sortLabel}>SORT BY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
        >
          {sortOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.sortButton,
                sortOption === option && styles.activeSortButton,
              ]}
              onPress={() => setSortOption(option)}
            >
              <Text style={[
                styles.sortButtonText,
                sortOption === option && styles.activeSortButtonText,
              ]}>
                {option === 'Newest first' && '↓ '}
                {option === 'Oldest first' && '↑ '}
                {option === 'Due date' && '📅 '}
                {option === 'Priority' && '⚑ '}
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Task list */}
      <FlatList
        style={styles.taskList}
        data={sortedTasks}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyTitle}>{getEmptyTitle()}</Text>
            <Text style={styles.emptyText}>{getEmptyMessage()}</Text>

            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.clearSearchAction}
                onPress={() => setSearchQuery('')}
              >
                <Text style={styles.clearSearchActionText}>Clear search</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[
            styles.taskCard,
            isOverdue(item) && styles.overdueTaskCard,
          ]}>
            <TouchableOpacity
              style={[
                styles.checkbox,
                item.completed && styles.checkedBox,
              ]}
              onPress={() => toggleTask(item.id)}
            >
              {item.completed && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            <View style={styles.taskDetails}>
              <Text style={[
                styles.taskTitle,
                item.completed && styles.completedTask,
              ]}>
                {item.title}
              </Text>

              <View style={styles.taskLabels}>
                <Text style={styles.categoryLabel}>{item.category}</Text>
                <Text style={[
                  styles.priorityLabel,
                  { color: getPriorityColor(item.priority) },
                ]}>
                  {item.priority} priority
                </Text>
              </View>

              {item.repeat && item.repeat !== 'None' && (
                <Text style={styles.repeatTaskLabel}>
                  🔁 Repeats {item.repeat.toLowerCase()}
                </Text>
              )}

              {item.dueDate && (
                <Text style={styles.dueDateLabel}>
                  📅 Due: {new Date(item.dueDate).toLocaleDateString()}
                </Text>
              )}

              {item.reminderAt && (
                <Text style={styles.reminderLabel}>
                  🔔 Reminder: {new Date(item.reminderAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              )}

              {isOverdue(item) && (
                <View style={styles.overdueBadge}>
                  <Text style={styles.overdueBadgeText}>OVERDUE</Text>
                </View>
              )}

              {isToday(item) && !item.completed && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>DUE TODAY</Text>
                </View>
              )}

              {isUpcoming(item) && (
                <View style={styles.upcomingBadge}>
                  <Text style={styles.upcomingBadgeText}>UPCOMING</Text>
                </View>
              )}

              {item.completed && (
                <Text style={styles.completedLabel}>COMPLETED</Text>
              )}
            </View>

            <View style={styles.taskActions}>
              <TouchableOpacity
                onPress={() => editTask(item)}
                style={styles.editButton}
                disabled={isAdding}
              >
                <Text style={styles.editText}>✎</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Delete task',
                    'Are you sure you want to delete this task?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => deleteTask(item.id),
                      },
                    ]
                  );
                }}
                style={styles.deleteButton}
                disabled={isAdding}
              >
                <Text style={styles.deleteText}>×</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Text style={styles.footer}>SMALL STEPS. BIG ACHIEVEMENTS.</Text>
    </SafeAreaView>
  );
}

function createStyles(isDark: boolean) {
  const palette = {
    background: isDark ? '#0F172A' : '#F5F7FB',
    card: isDark ? '#1E293B' : '#FFFFFF',
    text: isDark ? '#F8FAFC' : '#172554',
    body: isDark ? '#E2E8F0' : '#334155',
    secondary: isDark ? '#CBD5E1' : '#64748B',
    muted: '#94A3B8',
    primary: isDark ? '#60A5FA' : '#2563EB',
    border: isDark ? '#334155' : '#E2E8F0',
    panel: isDark ? '#172554' : '#EAF0FA',
    soft: isDark ? '#334155' : '#E8EDF5',
    track: isDark ? '#334155' : '#E2E8F0',
    subtleBorder: isDark ? '#334155' : '#F1F5F9',
    softBlue: isDark ? '#1E3A5F' : '#DBEAFE',
    softRed: isDark ? '#4C252D' : '#FEE2E2',
    softGreen: isDark ? '#173D32' : '#DCFCE7',
    blueText: isDark ? '#93C5FD' : '#1D4ED8',
    redText: isDark ? '#FCA5A5' : '#DC2626',
    greenText: isDark ? '#86EFAC' : '#15803D',
    purple: isDark ? '#C4B5FD' : '#7C3AED',
  };
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: 20,
  },
  header: {
    marginTop: 7,
    marginBottom: 9,
  },
  greeting: {
    color: palette.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  heading: {
    fontSize: 28,
    fontWeight: '900',
    color: palette.text,
    marginTop: 3,
  },
  subtitle: {
    color: palette.secondary,
    fontSize: 12,
    marginTop: 3,
  },

  // Compact dashboard containing statistics and progress.
  summary: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    elevation: 2,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 9,
    color: palette.secondary,
    fontWeight: '800',
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: palette.primary,
    marginTop: 2,
  },
  overdueNumber: {
    color: '#EF4444',
  },
  summaryDescription: {
    fontSize: 9,
    color: palette.muted,
    marginTop: 1,
  },
  summaryDivider: {
    height: 38,
    width: 1,
    backgroundColor: palette.border,
  },
  summaryProgress: {
    borderTopWidth: 1,
    borderTopColor: palette.subtleBorder,
    marginTop: 9,
    paddingTop: 8,
  },
  progressHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.secondary,
  },
  progressPercentage: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.primary,
  },
  progressTrack: {
    height: 6,
    backgroundColor: palette.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 10,
  },

  createTaskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.text,
  },
  toggleText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  formContainer: {
    backgroundColor: palette.panel,
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: palette.card,
    borderRadius: 13,
    padding: 5,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 2,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: palette.text,
  },
  addButton: {
    backgroundColor: palette.primary,
    width: 42,
    height: 42,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: palette.card,
    fontSize: 27,
  },
  cancelEditButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 8,
  },
  cancelEditText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  smallHeading: {
    fontSize: 12,
    color: palette.secondary,
    fontWeight: '800',
    marginBottom: 7,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  optionButton: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: palette.soft,
  },
  selectedOption: {
    backgroundColor: palette.primary,
  },
  optionText: {
    fontSize: 10,
    color: palette.secondary,
    fontWeight: '700',
  },
  selectedOptionText: {
    color: palette.card,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 15,
  },
  priorityButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  priorityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 11,
    color: palette.secondary,
    fontWeight: '600',
  },
  repeatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 7,
  },
  repeatButton: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
  },
  selectedRepeatButton: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  repeatButtonText: {
    color: palette.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
  selectedRepeatText: {
    color: palette.card,
  },
  repeatHint: {
    color: palette.primary,
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 12,
  },
  dateButton: {
    backgroundColor: palette.card,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.softBlue,
  },
  dateButtonText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  taskListHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: palette.text,
    marginBottom: 7,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: palette.border,
    elevation: 1,
  },
  searchIcon: {
    fontSize: 25,
    color: palette.secondary,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 13,
    color: palette.text,
  },
  clearSearchButton: {
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  clearSearchText: {
    fontSize: 23,
    color: palette.muted,
    fontWeight: '700',
  },
  clearSearchAction: {
    marginTop: 12,
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9,
  },
  clearSearchActionText: {
    color: palette.card,
    fontSize: 12,
    fontWeight: '800',
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 7,
  },
  filterRow: {
    gap: 7,
    paddingRight: 10,
  },
  filterButton: {
    backgroundColor: palette.soft,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
  },
  activeFilter: {
    backgroundColor: palette.primary,
  },
  filterText: {
    color: palette.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  activeFilterText: {
    color: palette.card,
  },
  overdueFilterButton: {
    backgroundColor: palette.softRed,
  },
  overdueFilterText: {
    color: palette.redText,
  },
  todayFilterButton: {
    backgroundColor: palette.softBlue,
  },
  todayFilterText: {
    color: palette.blueText,
  },
  upcomingFilterButton: {
    backgroundColor: palette.softGreen,
  },
  upcomingFilterText: {
    color: palette.greenText,
  },
  sortSection: {
    marginBottom: 7,
  },
  sortLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: palette.secondary,
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  sortRow: {
    gap: 7,
    paddingRight: 10,
  },
  sortButton: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },
  activeSortButton: {
    backgroundColor: palette.text,
    borderColor: palette.text,
  },
  sortButtonText: {
    color: palette.secondary,
    fontSize: 10,
    fontWeight: '700',
  },
  activeSortButtonText: {
    color: palette.card,
  },
  taskList: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 12,
    flexGrow: 1,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.card,
    padding: 13,
    borderRadius: 13,
    marginBottom: 9,
    elevation: 2,
  },
  overdueTaskCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkedBox: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkmark: {
    color: palette.card,
    fontWeight: '900',
    fontSize: 12,
  },
  taskDetails: {
    flex: 1,
    marginLeft: 11,
  },
  taskTitle: {
    fontSize: 13,
    color: palette.body,
    fontWeight: '700',
  },
  completedTask: {
    textDecorationLine: 'line-through',
    color: palette.muted,
  },
  taskLabels: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 5,
  },
  categoryLabel: {
    color: palette.secondary,
    fontSize: 10,
  },
  priorityLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  repeatTaskLabel: {
    fontSize: 10,
    color: palette.purple,
    fontWeight: '800',
    marginTop: 5,
  },
  dueDateLabel: {
    fontSize: 10,
    color: palette.secondary,
    marginTop: 5,
  },
  reminderLabel: {
    fontSize: 10,
    color: palette.primary,
    marginTop: 3,
  },
  overdueBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.softRed,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    marginTop: 6,
  },
  overdueBadgeText: {
    color: palette.redText,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  todayBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.softBlue,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    marginTop: 6,
  },
  todayBadgeText: {
    color: palette.blueText,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  upcomingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.softGreen,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 5,
    marginTop: 6,
  },
  upcomingBadgeText: {
    color: palette.greenText,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  completedLabel: {
    color: '#16A34A',
    fontSize: 9,
    fontWeight: '900',
    marginTop: 6,
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 5,
  },
  editButton: {
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  editText: {
    color: palette.primary,
    fontSize: 21,
    fontWeight: '800',
  },
  deleteButton: {
    paddingHorizontal: 7,
  },
  deleteText: {
    color: '#EF4444',
    fontSize: 25,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 25,
    padding: 15,
  },
  emptyIcon: {
    fontSize: 35,
    color: palette.primary,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.text,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 5,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    fontSize: 9,
    color: palette.muted,
    fontWeight: '800',
    letterSpacing: 2,
    paddingVertical: 6,
  },
});
}
