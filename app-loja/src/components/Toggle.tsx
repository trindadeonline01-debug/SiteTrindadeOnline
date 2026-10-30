import { Pressable, View, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function Toggle({ on, onPress, small, disabled }: { on: boolean; onPress: () => void; small?: boolean; disabled?: boolean }) {
  const w = small ? 34 : 44, h = small ? 20 : 25, k = small ? 14 : 19;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} style={[{ width: w, height: h, borderRadius: h / 2, backgroundColor: on ? colors.good : '#CFCAC0', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }]}>
      <View style={[styles.knob, { width: k, height: k, borderRadius: k / 2, left: on ? w - k - 3 : 3 }]} />
    </Pressable>
  );
}
const styles = StyleSheet.create({ knob: { position: 'absolute', backgroundColor: '#fff' } });
