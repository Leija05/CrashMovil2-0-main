import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, RADIUS, SPACING } from '../src/theme';
import { useBluetooth } from '../src/context/BluetoothContext';
import type { ScanDevice } from '../src/services/bluetooth';

export default function DevicesScreen() {
  const router = useRouter();
  const { startDeviceScan, connect, status, statusDetail, nativeAvailable } = useBluetooth();
  const [devices, setDevices] = useState<ScanDevice[]>([]);
  const [scanning, setScanning] = useState(false);

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

  useEffect(() => { scan(); }, [scan]);

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

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleConnect(item.id)}>
            <Ionicons name="bluetooth" size={20} color={COLORS.accent} />
            <View style={{flex: 1}}>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceAddr}>{item.id}</Text>
              <Text style={styles.deviceMeta}>{item.moduleType} · {item.isCompatible ? 'Compatible' : 'No verificado'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No se encontraron dispositivos BLE. Verifica que tu HC-05/HM-10 esté encendido y en advertising.</Text>}
      />
      {!nativeAvailable && (
        <Text style={styles.warn}>
          Esta build no tiene BLE nativo. Para escanear módulos reales usa Android físico con development build.
        </Text>
      )}
      <Text style={styles.note}>
        Compatible con módulos BLE como HC-05, HM-10, BT05 y AT-09. Si no aparece, reinicia el módulo y vuelve a escanear.
      </Text>
      <Text style={styles.footer}>Estado: {statusDetail || status}</Text>
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
  deviceMeta: { color: COLORS.textSec, fontSize: 10, marginTop: 2 },
  empty: { color: COLORS.textDim, textAlign: 'center', marginTop: 50 },
  warn: { color: COLORS.warning, fontSize: 11, textAlign: 'center', marginTop: 10 },
  note: { color: COLORS.info, fontSize: 11, textAlign: 'center', marginTop: 10 },
  footer: { color: COLORS.textDim, fontSize: 10, textAlign: 'center', marginTop: 20 }
});
