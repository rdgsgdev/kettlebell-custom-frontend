import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '../../theme';

const DELETE_WIDTH = 80;

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  borderRadius?: number;
  style?: ViewStyle;
  compact?: boolean;
}

export default function SwipeableRow({
  children,
  onDelete,
  borderRadius = Radius.lg,
  style,
  compact = false,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [rowWidth, setRowWidth] = useState(Dimensions.get('window').width);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const handleDelete = useCallback(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: true });
    setTimeout(() => onDeleteRef.current(), 220);
  }, []);

  return (
    <View
      style={[styles.wrapper, { borderRadius }, style]}
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        snapToOffsets={[0, DELETE_WIDTH]}
        decelerationRate="fast"
        scrollEventThrottle={16}
      >
        {/* Card content — full container width */}
        <View style={{ width: rowWidth, borderRadius, overflow: 'hidden' }}>
          {children}
        </View>

        {/* Delete action — revealed on swipe left */}
        <View style={compact ? styles.deleteAreaCompact : styles.deleteArea}>
          <TouchableOpacity
            style={compact ? styles.deleteBtnCompact : styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
  // Default (expanded / fixed-height) delete button — centered square
  deleteArea: {
    width: DELETE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  deleteBtn: {
    width: 56,
    height: 56,
    backgroundColor: '#EF4444',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Compact (collapsed row) delete button — stretches to card height
  deleteAreaCompact: {
    width: DELETE_WIDTH,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  deleteBtnCompact: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#EF4444',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

