import React, { useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../../theme';
import { isSameDay } from '../../utils/helpers';
import { useSettings } from '../../context/SettingsContext';

interface Props {
  workoutDates: string[]; // ISO strings of days with workouts
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

function buildDays(count = 60): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function CalendarStrip({ workoutDates, selectedDate, onSelectDate }: Props) {
  const { colors } = useSettings();
  const styles = makeStyles(colors);
  const days = buildDays(60);
  const scrollRef = useRef<ScrollView>(null);

  React.useEffect(() => {
    // Scroll to end (today) on mount
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.strip}
    >
      {days.map((day) => {
        const iso = day.toISOString();
        const hasWorkout = workoutDates.some((d) => isSameDay(d, iso));
        const isSelected = selectedDate ? isSameDay(selectedDate, iso) : false;
        const isToday = isSameDay(iso, new Date().toISOString());
        const dayLabel = DAY_LABELS[day.getDay()];
        const dateNum = day.getDate();
        const isFirstOfMonth = dateNum === 1;

        return (
          <View key={iso} style={styles.dayWrapper}>
            {isFirstOfMonth && (
              <Text style={styles.monthLabel}>{MONTH_LABELS[day.getMonth()]}</Text>
            )}
            <TouchableOpacity
              onPress={() => onSelectDate(iso)}
              activeOpacity={0.7}
              style={[
                styles.day,
                isSelected && styles.daySelected,
                isToday && !isSelected && styles.dayToday,
              ]}
            >
              <Text
                style={[
                  styles.dayLabel,
                  isSelected && styles.textSelected,
                  isToday && !isSelected && styles.textToday,
                ]}
              >
                {dayLabel}
              </Text>
              <Text
                style={[
                  styles.dateNum,
                  isSelected && styles.textSelected,
                  isToday && !isSelected && styles.textToday,
                ]}
              >
                {dateNum}
              </Text>
              <View
                style={[
                  styles.dot,
                  isSelected && { backgroundColor: '#fff' },
                  !hasWorkout && { opacity: 0 },
                ]}
              />
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(c: typeof Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    strip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      alignItems: 'center',
    },
    dayWrapper: {
      alignItems: 'center',
      marginRight: 4,
    },
    monthLabel: {
      ...Typography.tiny,
      color: c.textTertiary,
      marginBottom: 2,
      letterSpacing: 0.5,
    },
    day: {
      width: 40,
      height: 60,
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    daySelected: {
      backgroundColor: c.accent,
    },
    dayToday: {
      backgroundColor: c.surfaceElevated,
      borderWidth: 1,
      borderColor: c.border,
    },
    dayLabel: {
      ...Typography.tiny,
      color: c.textTertiary,
    },
    dateNum: {
      ...Typography.captionBold,
      color: c.textSecondary,
    },
    textSelected: {
      color: '#fff',
    },
    textToday: {
      color: c.textPrimary,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.accent,
      marginTop: 2,
    },
  });
}
