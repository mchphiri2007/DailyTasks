
import { useAppTheme } from '@/context/theme-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Task = {
  id: string;
  title: string;
  completed: boolean;
  category: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate?: string;
  reminderAt?: string;
  repeat?: string;
};

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthNames = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
];

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getPriorityColor = (priority: Task['priority']) => {
  if (priority === 'High') return '#EF4444';
  if (priority === 'Medium') return '#F59E0B';
  return '#16A34A';
};

export default function CalendarScreen() {
  const router = useRouter();
  const { isDark } = useAppTheme();

  const styles = useMemo(() => createStyles(isDark), [isDark]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  const todayKey = dateKey(new Date());
  const selectedKey = dateKey(selectedDate);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadTasks = async () => {
        try {
          const savedTasks = await AsyncStorage.getItem('my_tasks');

          if (savedTasks && active) {
            setTasks(JSON.parse(savedTasks));
          } else if (active) {
            setTasks([]);
          }
        } catch (error) {
          console.log('Calendar loading error:', error);
        } finally {
          if (active) setIsLoading(false);
        }
      };

      loadTasks();

      return () => {
        active = false;
      };
    }, [])
  );

  const tasksByDate = useMemo(() => {
    const grouped: Record<string, Task[]> = {};

    tasks.forEach((task) => {
      if (!task.dueDate) return;

      const dueDate = new Date(task.dueDate);

      if (Number.isNaN(dueDate.getTime())) return;

      const key = dateKey(dueDate);

      if (!grouped[key]) grouped[key] = [];

      grouped[key].push(task);
    });

    return grouped;
  }, [tasks]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: (Date | null)[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, [currentMonth]);

  const selectedTasks = tasksByDate[selectedKey] || [];

  const pendingCount = selectedTasks.filter(
    (task) => !task.completed
  ).length;

  const completedCount = selectedTasks.filter(
    (task) => task.completed
  ).length;

  const isTaskOverdue = (task: Task) => {
    if (!task.dueDate || task.completed) return false;

    return dateKey(new Date(task.dueDate)) < todayKey;
  };

  const changeMonth = (amount: number) => {
    setCurrentMonth((previous) => {
      return new Date(
        previous.getFullYear(),
        previous.getMonth() + amount,
        1
      );
    });
  };

  const goToToday = () => {
    const today = new Date();

    setCurrentMonth(
      new Date(today.getFullYear(), today.getMonth(), 1)
    );

    setSelectedDate(today);
  };

  const openTaskList = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? '#0B1220' : '#F5F7FB'}
      />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={openTaskList}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Back to tasks</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Task Calendar</Text>

        <Text style={styles.subtitle}>
          Organise your schedule, one day at a time.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading your tasks...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.calendarCard}>
            <View style={styles.monthHeader}>
              <TouchableOpacity
                style={styles.monthArrow}
                onPress={() => changeMonth(-1)}
              >
                <Text style={styles.arrowText}>‹</Text>
              </TouchableOpacity>

              <View style={styles.monthTitleContainer}>
                <Text style={styles.monthTitle}>
                  {monthNames[currentMonth.getMonth()]}
                </Text>

                <Text style={styles.yearTitle}>
                  {currentMonth.getFullYear()}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.monthArrow}
                onPress={() => changeMonth(1)}
              >
                <Text style={styles.arrowText}>›</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.todayButton}
              onPress={goToToday}
            >
              <Text style={styles.todayButtonText}>Go to today</Text>
            </TouchableOpacity>

            <View style={styles.weekHeader}>
              {weekDays.map((day) => (
                <View key={day} style={styles.weekDayCell}>
                  <Text style={styles.weekDayText}>{day}</Text>
                </View>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.map((day, index) => {
                if (!day) {
                  return (
                    <View
                      key={`blank-${index}`}
                      style={styles.dayCell}
                    />
                  );
                }

                const key = dateKey(day);
                const dayTasks = tasksByDate[key] || [];
                const isSelected = key === selectedKey;
                const isTodayDate = key === todayKey;

                const hasPending = dayTasks.some(
                  (task) => !task.completed
                );

                const hasCompleted = dayTasks.some(
                  (task) => task.completed
                );

                const hasOverdue = dayTasks.some(isTaskOverdue);

                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.dayCell,
                      isSelected && styles.selectedDayCell,
                      isTodayDate && !isSelected && styles.todayCell,
                    ]}
                    onPress={() => setSelectedDate(day)}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        isSelected && styles.selectedDayNumber,
                        isTodayDate && !isSelected && styles.todayNumber,
                      ]}
                    >
                      {day.getDate()}
                    </Text>

                    <View style={styles.dayIndicators}>
                      {hasPending && (
                        <View
                          style={[
                            styles.indicator,
                            styles.pendingIndicator,
                          ]}
                        />
                      )}

                      {hasCompleted && (
                        <View
                          style={[
                            styles.indicator,
                            styles.completedIndicator,
                          ]}
                        />
                      )}

                      {hasOverdue && (
                        <View
                          style={[
                            styles.indicator,
                            styles.overdueIndicator,
                          ]}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.pendingIndicator]} />
                <Text style={styles.legendText}>Pending</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.completedIndicator]} />
                <Text style={styles.legendText}>Completed</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.overdueIndicator]} />
                <Text style={styles.legendText}>Overdue</Text>
              </View>
            </View>
          </View>

          <View style={styles.selectedDateHeader}>
            <View>
              <Text style={styles.selectedDateTitle}>
                {selectedDate.toLocaleDateString([], {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>

              <Text style={styles.selectedDateSubtitle}>
                {selectedTasks.length === 0
                  ? 'No tasks scheduled'
                  : `${selectedTasks.length} scheduled task${selectedTasks.length === 1 ? '' : 's'}`}
              </Text>
            </View>

            <View style={styles.countContainer}>
              <Text style={styles.countText}>
                {pendingCount} pending
              </Text>
              <Text style={styles.countText}>
                {completedCount} done
              </Text>
            </View>
          </View>

          {selectedTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyTitle}>Nothing planned</Text>
              <Text style={styles.emptyMessage}>
                There are no tasks scheduled for this date.
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={openTaskList}
              >
                <Text style={styles.emptyButtonText}>
                  Go to task list
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            selectedTasks.map((task) => (
              <View key={task.id} style={styles.taskCard}>
                <View
                  style={[
                    styles.priorityLine,
                    { backgroundColor: getPriorityColor(task.priority) },
                  ]}
                />

                <View style={styles.taskInfo}>
                  <Text
                    style={[
                      styles.taskTitle,
                      task.completed && styles.completedTaskTitle,
                    ]}
                  >
                    {task.title}
                  </Text>

                  <Text style={styles.taskCategory}>
                    {task.category} · {task.priority} priority
                  </Text>

                  {task.reminderAt && (
                    <Text style={styles.reminderText}>
                      🔔 {new Date(task.reminderAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  )}

                  {task.repeat && task.repeat !== 'None' && (
                    <Text style={styles.repeatText}>
                      Repeats {task.repeat.toLowerCase()}
                    </Text>
                  )}
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    task.completed
                      ? styles.completedBadge
                      : isTaskOverdue(task)
                        ? styles.overdueBadge
                        : styles.pendingBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      task.completed
                        ? styles.completedStatusText
                        : isTaskOverdue(task)
                          ? styles.overdueStatusText
                          : styles.pendingStatusText,
                    ]}
                  >
                    {task.completed
                      ? 'DONE'
                      : isTaskOverdue(task)
                        ? 'OVERDUE'
                        : 'PENDING'}
                  </Text>
                </View>
              </View>
            ))
          )}

          <Text style={styles.footer}>
            SMALL STEPS. BIG ACHIEVEMENTS.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#0B1220' : '#F5F7FB',
      paddingHorizontal: 18,
    },
    header: {
      paddingTop: 12,
      paddingBottom: 16,
    },
    backButton: {
      alignSelf: 'flex-start',
      paddingVertical: 7,
      paddingRight: 12,
      marginBottom: 12,
    },
    backText: {
      color: '#3B82F6',
      fontSize: 13,
      fontWeight: '800',
    },
    heading: {
      color: isDark ? '#F8FAFC' : '#172554',
      fontSize: 27,
      fontWeight: '900',
    },
    subtitle: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      marginTop: 5,
    },
    scrollContent: {
      paddingBottom: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 12,
    },
    calendarCard: {
      backgroundColor: isDark ? '#111C2E' : '#FFFFFF',
      borderRadius: 18,
      padding: 14,
      elevation: isDark ? 0 : 2,
      borderWidth: isDark ? 1 : 0,
      borderColor: '#263449',
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    monthArrow: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    arrowText: {
      color: '#3B82F6',
      fontSize: 29,
      lineHeight: 32,
      fontWeight: '700',
    },
    monthTitleContainer: {
      alignItems: 'center',
    },
    monthTitle: {
      color: isDark ? '#F8FAFC' : '#172554',
      fontSize: 19,
      fontWeight: '900',
    },
    yearTitle: {
      color: isDark ? '#94A3B8' : '#94A3B8',
      fontSize: 12,
      marginTop: 2,
    },
    todayButton: {
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 15,
      backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF',
      paddingHorizontal: 15,
      paddingVertical: 7,
      borderRadius: 20,
    },
    todayButtonText: {
      color: '#3B82F6',
      fontSize: 11,
      fontWeight: '800',
    },
    weekHeader: {
      flexDirection: 'row',
      marginBottom: 5,
    },
    weekDayCell: {
      width: `${100 / 7}%`,
      alignItems: 'center',
      paddingVertical: 7,
    },
    weekDayText: {
      color: isDark ? '#94A3B8' : '#94A3B8',
      fontSize: 10,
      fontWeight: '800',
    },
    calendarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: `${100 / 7}%`,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 10,
      marginBottom: 3,
    },
    selectedDayCell: {
      backgroundColor: '#2563EB',
    },
    todayCell: {
      backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE',
    },
    dayNumber: {
      color: isDark ? '#CBD5E1' : '#334155',
      fontSize: 13,
      fontWeight: '700',
    },
    selectedDayNumber: {
      color: '#FFFFFF',
      fontWeight: '900',
    },
    todayNumber: {
      color: isDark ? '#93C5FD' : '#1D4ED8',
      fontWeight: '900',
    },
    dayIndicators: {
      flexDirection: 'row',
      height: 6,
      gap: 3,
      marginTop: 3,
    },
    indicator: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    pendingIndicator: {
      backgroundColor: '#2563EB',
    },
    completedIndicator: {
      backgroundColor: '#16A34A',
    },
    overdueIndicator: {
      backgroundColor: '#EF4444',
    },
    legend: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 15,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#263449' : '#F1F5F9',
      marginTop: 12,
      paddingTop: 12,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    legendDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    legendText: {
      color: isDark ? '#A8B4C5' : '#64748B',
      fontSize: 10,
    },
    selectedDateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 22,
      marginBottom: 11,
    },
    selectedDateTitle: {
      color: isDark ? '#F8FAFC' : '#172554',
      fontSize: 15,
      fontWeight: '900',
    },
    selectedDateSubtitle: {
      color: isDark ? '#94A3B8' : '#94A3B8',
      fontSize: 11,
      marginTop: 4,
    },
    countContainer: {
      alignItems: 'flex-end',
      gap: 4,
    },
    countText: {
      color: isDark ? '#A8B4C5' : '#64748B',
      fontSize: 10,
      fontWeight: '700',
    },
    emptyCard: {
      backgroundColor: isDark ? '#111C2E' : '#FFFFFF',
      borderRadius: 15,
      padding: 24,
      alignItems: 'center',
      marginTop: 3,
      borderWidth: isDark ? 1 : 0,
      borderColor: '#263449',
    },
    emptyIcon: {
      fontSize: 30,
    },
    emptyTitle: {
      color: isDark ? '#F8FAFC' : '#172554',
      fontSize: 15,
      fontWeight: '900',
      marginTop: 10,
    },
    emptyMessage: {
      color: isDark ? '#A8B4C5' : '#94A3B8',
      fontSize: 11,
      textAlign: 'center',
      marginTop: 5,
    },
    emptyButton: {
      backgroundColor: '#2563EB',
      borderRadius: 9,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginTop: 15,
    },
    emptyButtonText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
    },
    taskCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#111C2E' : '#FFFFFF',
      borderRadius: 13,
      padding: 13,
      marginBottom: 9,
      elevation: isDark ? 0 : 1,
      borderWidth: isDark ? 1 : 0,
      borderColor: '#263449',
    },
    priorityLine: {
      width: 4,
      alignSelf: 'stretch',
      borderRadius: 5,
      marginRight: 11,
    },
    taskInfo: {
      flex: 1,
    },
    taskTitle: {
      color: isDark ? '#E2E8F0' : '#334155',
      fontSize: 13,
      fontWeight: '800',
    },
    completedTaskTitle: {
      color: isDark ? '#64748B' : '#94A3B8',
      textDecorationLine: 'line-through',
    },
    taskCategory: {
      color: isDark ? '#A8B4C5' : '#64748B',
      fontSize: 10,
      marginTop: 5,
    },
    reminderText: {
      color: isDark ? '#60A5FA' : '#2563EB',
      fontSize: 10,
      marginTop: 5,
    },
    repeatText: {
      color: isDark ? '#C4B5FD' : '#7C3AED',
      fontSize: 10,
      fontWeight: '700',
      marginTop: 4,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
      marginLeft: 7,
    },
    pendingBadge: {
      backgroundColor: isDark ? '#1E3A5F' : '#DBEAFE',
    },
    completedBadge: {
      backgroundColor: isDark ? '#14532D' : '#DCFCE7',
    },
    overdueBadge: {
      backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2',
    },
    statusText: {
      fontSize: 8,
      fontWeight: '900',
    },
    pendingStatusText: {
      color: isDark ? '#93C5FD' : '#1D4ED8',
    },
    completedStatusText: {
      color: isDark ? '#86EFAC' : '#15803D',
    },
    overdueStatusText: {
      color: isDark ? '#FCA5A5' : '#DC2626',
    },
    footer: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 2,
      textAlign: 'center',
      paddingVertical: 20,
    },
  });
