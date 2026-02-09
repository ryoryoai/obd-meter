import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderGestureState,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { database } from '../storage/database';

/** カラーパレット (ダークテーマ) */
const Colors = {
  background: '#0f0f1a',
  section: '#1a1a2e',
  primary: '#00d4ff',
  accent: '#e94560',
  success: '#00ff88',
  warning: '#ffd700',
  text: '#ffffff',
  subText: '#888888',
  border: '#2a2a3e',
} as const;

/**
 * 設定画面
 *
 * セクション分け: 接続設定 / 表示設定 / データ設定
 * settingsStore を使って設定値の読み書きを行う。
 */
export function SettingsScreen(): React.JSX.Element {
  const {
    pollingInterval,
    autoReconnect,
    theme,
    unit,
    keepScreenOn,
    autoLog,
    logBufferSize,
    setPollingInterval,
    setAutoReconnect,
    setTheme,
    setUnit,
    toggleKeepScreen,
    setAutoLog,
    clearData,
  } = useSettingsStore();

  const isDark = theme === 'dark';

  const handleClearData = useCallback(() => {
    Alert.alert(
      'データクリア',
      '全てのログデータを削除します。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.clearAllData();
              clearData();
            } catch (err) {
              Alert.alert(
                'エラー',
                `データ削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          },
        },
      ],
    );
  }, [clearData]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* 接続設定 */}
      <SectionHeader title="接続設定" />
      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowLabelContainer}>
            <Text style={styles.label}>ポーリング間隔</Text>
            <Text style={styles.valueText}>{Math.round(pollingInterval)}ms</Text>
          </View>
          <CustomSlider
            minimumValue={100}
            maximumValue={1000}
            step={50}
            value={pollingInterval}
            onValueChange={setPollingInterval}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.subText}>100ms</Text>
            <Text style={styles.subText}>1000ms</Text>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.switchRow}>
          <Text style={styles.label}>自動再接続</Text>
          <Switch
            value={autoReconnect}
            onValueChange={setAutoReconnect}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={autoReconnect ? Colors.text : Colors.subText}
          />
        </View>
      </View>

      {/* 表示設定 */}
      <SectionHeader title="表示設定" />
      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>ダークテーマ</Text>
          <Switch
            value={isDark}
            onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={isDark ? Colors.text : Colors.subText}
          />
        </View>

        <View style={styles.separator} />

        <View style={styles.row}>
          <Text style={styles.label}>単位系</Text>
          <SegmentedControl
            options={['Metric', 'Imperial']}
            selectedIndex={unit === 'metric' ? 0 : 1}
            onSelect={(index) => setUnit(index === 0 ? 'metric' : 'imperial')}
          />
        </View>

        <View style={styles.separator} />

        <View style={styles.switchRow}>
          <Text style={styles.label}>画面常時点灯</Text>
          <Switch
            value={keepScreenOn}
            onValueChange={toggleKeepScreen}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={keepScreenOn ? Colors.text : Colors.subText}
          />
        </View>
      </View>

      {/* データ設定 */}
      <SectionHeader title="データ設定" />
      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>自動ログ記録</Text>
          <Switch
            value={autoLog}
            onValueChange={setAutoLog}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor={autoLog ? Colors.text : Colors.subText}
          />
        </View>

        <View style={styles.separator} />

        <View style={styles.switchRow}>
          <Text style={styles.label}>ログバッファサイズ</Text>
          <Text style={styles.valueText}>
            {logBufferSize.toLocaleString()} 件
          </Text>
        </View>

        <View style={styles.separator} />

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleClearData}
          activeOpacity={0.7}
        >
          <Text style={styles.dangerButtonText}>データをクリア</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// --- Sub-components ---

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

interface SegmentedControlProps {
  options: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function SegmentedControl({
  options,
  selectedIndex,
  onSelect,
}: SegmentedControlProps): React.JSX.Element {
  return (
    <View style={styles.segmentedContainer}>
      {options.map((option, index) => {
        const isSelected = index === selectedIndex;
        return (
          <TouchableOpacity
            key={option}
            style={[
              styles.segmentedOption,
              isSelected && styles.segmentedOptionSelected,
              index === 0 && styles.segmentedOptionFirst,
              index === options.length - 1 && styles.segmentedOptionLast,
            ]}
            onPress={() => onSelect(index)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.segmentedText,
                isSelected && styles.segmentedTextSelected,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// --- Custom Slider (no external dependency) ---

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 4;

interface CustomSliderProps {
  minimumValue: number;
  maximumValue: number;
  step: number;
  value: number;
  onValueChange: (value: number) => void;
}

function CustomSlider({
  minimumValue,
  maximumValue,
  step,
  value,
  onValueChange,
}: CustomSliderProps): React.JSX.Element {
  const trackWidthRef = useRef(0);
  const [localValue, setLocalValue] = useState(value);
  const isDragging = useRef(false);

  /** 値の割合 (0~1) */
  const ratio = (localValue - minimumValue) / (maximumValue - minimumValue);

  const snapToStep = (raw: number): number => {
    const clamped = Math.max(minimumValue, Math.min(maximumValue, raw));
    return Math.round(clamped / step) * step;
  };

  const valueFromPosition = (pageX: number, layoutX: number): number => {
    const trackWidth = trackWidthRef.current;
    if (trackWidth <= 0) {
      return localValue;
    }
    const relativeX = pageX - layoutX;
    const rawRatio = relativeX / trackWidth;
    const rawValue = minimumValue + rawRatio * (maximumValue - minimumValue);
    return snapToStep(rawValue);
  };

  const trackLayoutXRef = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        isDragging.current = true;
        const newValue = valueFromPosition(evt.nativeEvent.pageX, trackLayoutXRef.current);
        setLocalValue(newValue);
        onValueChange(newValue);
      },
      onPanResponderMove: (evt: GestureResponderEvent, _gestureState: PanResponderGestureState) => {
        const newValue = valueFromPosition(evt.nativeEvent.pageX, trackLayoutXRef.current);
        setLocalValue(newValue);
        onValueChange(newValue);
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
      },
    }),
  ).current;

  const handleLayout = (event: LayoutChangeEvent) => {
    trackWidthRef.current = event.nativeEvent.layout.width;
    trackLayoutXRef.current = event.nativeEvent.layout.x;

    // measure absolute position for accurate pageX calculation
    (event.target as any)?.measure?.(
      (_x: number, _y: number, _width: number, _height: number, pageX: number) => {
        if (pageX != null) {
          trackLayoutXRef.current = pageX;
        }
      },
    );
  };

  // Sync external value changes (when not dragging)
  React.useEffect(() => {
    if (!isDragging.current) {
      setLocalValue(value);
    }
  }, [value]);

  return (
    <View
      style={sliderStyles.container}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      {/* Track background */}
      <View style={sliderStyles.track}>
        {/* Filled portion */}
        <View
          style={[
            sliderStyles.trackFilled,
            { width: `${ratio * 100}%` },
          ]}
        />
      </View>
      {/* Thumb */}
      <View
        style={[
          sliderStyles.thumb,
          {
            left: `${ratio * 100}%`,
            marginLeft: -(THUMB_SIZE / 2),
          },
        ]}
      />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: Colors.border,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
  },
  trackFilled: {
    height: TRACK_HEIGHT,
    backgroundColor: Colors.primary,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Colors.primary,
    top: (40 - THUMB_SIZE) / 2,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  sectionHeader: {
    backgroundColor: Colors.section,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  sectionHeaderText: {
    color: Colors.subText,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  section: {
    backgroundColor: Colors.section,
    marginHorizontal: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    paddingVertical: 12,
  },
  rowLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  label: {
    color: Colors.text,
    fontSize: 16,
  },
  valueText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  subText: {
    color: Colors.subText,
    fontSize: 12,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dangerButton: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginVertical: 12,
  },
  dangerButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  segmentedOption: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  segmentedOptionFirst: {
    borderTopLeftRadius: 7,
    borderBottomLeftRadius: 7,
  },
  segmentedOptionLast: {
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
  },
  segmentedOptionSelected: {
    backgroundColor: Colors.primary,
  },
  segmentedText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentedTextSelected: {
    color: Colors.background,
  },
});
