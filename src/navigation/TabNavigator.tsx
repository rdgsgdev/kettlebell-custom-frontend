import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import WorkoutScreen from '../screens/WorkoutScreen';
import ExecutionScreen from '../screens/ExecutionScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ExercisesScreen from '../screens/ExercisesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import GlassSurface from '../components/common/GlassSurface';

export type RootTabParamList = {
  Exercises: undefined;
  Workout: undefined;
  Execution: undefined;
  Progress: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * Custom bottom tab bar wrapped in a Liquid Glass surface. On iOS 26+ this is
 * the native Apple material; everywhere else it's an expo-blur frosted bar
 * (web gets a real CSS backdrop-filter blur).
 *
 * The bar floats over content with a larger inset and no hard top border — the
 * glass edge reads as the separator, matching the iOS 26 floating-tab aesthetic.
 */
function GlassTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors } = useSettings();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom + 6,
          height: Platform.OS === 'ios' ? 84 + insets.bottom : 64 + insets.bottom,
        },
      ]}
    >
      <GlassSurface
        interactive
        radius={28}
        intensity="regular"
        style={styles.bar}
      >
        <View style={styles.iconsRow}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name as never);
              }
            };

            const Icon = options.tabBarIcon as
              | ((p: { color: string; size: number }) => React.ReactNode)
              | undefined;
            const size = options.tabBarIcon ? 24 : 24;
            const color = isFocused ? colors.accent : colors.textTertiary;

            return (
              <React.Fragment key={route.key}>
                <GlassTabItem
                  isFocused={isFocused}
                  accentColor={colors.accent}
                  accentDim={colors.accentDim}
                  onPress={onPress}
                >
                  {Icon ? Icon({ color, size }) : null}
                </GlassTabItem>
              </React.Fragment>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

/**
 * A single tab item. Focused items get an interactive glass pill behind them;
 * this is the "morph into a single surface when they touch" behavior on iOS 26.
 * On other platforms the pill is a subtle accent-tinted rounded rect.
 */
const GlassTabItem = React.memo(function GlassTabItem({
  children,
  isFocused,
  accentColor,
  accentDim,
  onPress,
}: {
  children: React.ReactNode;
  isFocused: boolean;
  accentColor: string;
  accentDim: string;
  onPress: () => void;
}) {
  return (
    <GlassSurface
      interactive={isFocused}
      radius={20}
      intensity="regular"
      fallbackTint={isFocused ? accentDim : 'transparent'}
      style={[
        styles.tabItem,
        isFocused && { borderColor: accentColor, borderWidth: 1 },
      ]}
    >
      <TabPressable onPress={onPress}>{children}</TabPressable>
    </GlassSurface>
  );
});

// Minimal pressable that avoids pulling react-native-gesture-handler into the
// tab bar (keeps the dependency surface identical to the prior implementation).
function TabPressable({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.pressable}>
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  bar: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  iconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  pressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function TabNavigator() {
  const { colors } = useSettings();

  return (
    <Tab.Navigator
      initialRouteName="Execution"
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // These are consumed by GlassTabBar for icon color/size; the actual
        // bar styling is handled by the custom tabBar component above.
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
      <Tab.Screen
        name="Exercises"
        component={ExercisesScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" color={color} size={size - 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Workout"
        component={WorkoutScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Execution"
        component={ExecutionScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="timer-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Progress"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size - 2} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
