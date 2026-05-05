import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING } from '../src/theme';
import { useBluetooth } from '../src/context/BluetoothContext';
import type { ScanDevice } from '../src/services/bluetooth';

export default function DevicesScreen() {
  const router = useRouter();
  const { startDeviceScan, connect, status, statusDetail, savedDeviceName, setSavedDeviceName } = useBluetooth();
  const [devices, setDevices] = useState<ScanDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [customName, setCustomName] = useState('');

  const scan = useCallback(async () => {
    setDevices([]);
    setScanning(true);
    await startDeviceScan((newDev) => {
      setDevices((prev) => {
        if (prev.find(d => d.id === newDev.id)) return prev;
        return [...prev, newDev];
      });
    });
    setTimeout(() => setScanning(false), 8000);
  }, [startDeviceScan]);

  useEffect(() => { scan(); }, []);
  useEffect(() => { if (savedDeviceName) setCustomName(savedDeviceName); }, [savedDeviceName]);

  const handleConnect = async (id: string) => {
    const ok = await connect(id);
    if (ok) router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>BUSCAR CASCO</Text>
        <TouchableOpacity onPress={scan} disabled={scanning}>
          {scanning ? <ActivityIndicator color={COLORS.accent} /> : <Ionicons name="refresh" size={24} color={COLORS.accent} />}
        </TouchableOpacity>
      </View>

      <View style={styles.nameWrap}>
        <Text style={styles.nameLabel}>NOMBRE DEL DISPOSITIVO</Text>
        <TextInput value={customName} onChangeText={setCustomName} placeholder="Ej. Casco CRASH" placeholderTextColor={COLORS.textDim} style={styles.nameInput} onEndEditing={() => setSavedDeviceName(customName.trim())} />
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleConnect(item.id)}>
            <Ionicons name="bluetooth" size={20} color={COLORS.accent} />
            <View style={{flex: 1}}>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceAddr}>{item.id}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No se encontraron dispositivos BLE...</Text>}
      />
      <Text style={styles.footer}>Estado: {statusDetail || status}</Text>
      {status === 'busy' && <Text style={styles.busy}>Este circuito parece estar conectado en otro teléfono.</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: SPACING.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, padding: 15, borderRadius: RADIUS.md, marginBottom: 10, gap: 15 },
  deviceName: { color: COLORS.text, fontWeight: '700' },
  deviceAddr: { color: COLORS.textDim, fontSize: 10 },
  empty: { color: COLORS.textDim, textAlign: 'center', marginTop: 50 },
  nameWrap: { marginBottom: 14 },
  nameLabel: { color: COLORS.textDim, fontSize: 10, marginBottom: 6, letterSpacing: 1 },
  nameInput: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text },
  footer: { color: COLORS.textDim, fontSize: 10, textAlign: 'center', marginTop: 20 },
  busy: { color: COLORS.warning, textAlign: 'center', fontSize: 12, marginTop: 6 }
});