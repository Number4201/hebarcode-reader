import React from 'react';
import {
  Button,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  APP_DESCRIPTION,
  DEVELOPMENT_ITEMS,
  APP_HEADLINE,
  APP_NAME,
  HYGIENE_ITEMS,
  STACK_ITEMS,
} from './src/content';
import {SectionCard} from './src/components/SectionCard';
import {MOCK_BARCODES} from './src/scanner/mockData';
import {ScannerStage} from './src/components/ScannerStage';
import {useScannerPrototype} from './src/scanner/useScannerPrototype';
import {useNativeScanner} from './src/hooks/useNativeScanner';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const {status, statusLabel, capabilities, latestFrame, detections, start, refreshStatus} =
    useNativeScanner();
  const overlayDetections = latestFrame ? detections : MOCK_BARCODES;
  const {selectedBarcode, selectBarcode, clearSelection} = useScannerPrototype(overlayDetections);

  const requestCameraPermission = React.useCallback(async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      await refreshStatus();
      await start();
    }
  }, [refreshStatus, start]);

  return (
    <SafeAreaView style={[styles.safeArea, isDarkMode ? styles.dark : styles.light]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
          {APP_NAME}
        </Text>
        <Text style={[styles.title, isDarkMode ? styles.textDark : styles.textLight]}>
          {APP_HEADLINE}
        </Text>
        <Text style={[styles.body, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
          {APP_DESCRIPTION}
        </Text>

        <SectionCard title="Planned scanning stack" isDarkMode={isDarkMode}>
          {STACK_ITEMS.map(item => (
            <Text
              key={item}
              style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
              • {item}
            </Text>
          ))}
        </SectionCard>

        <SectionCard title="Repository hygiene" isDarkMode={isDarkMode}>
          {HYGIENE_ITEMS.map(item => (
            <Text
              key={item}
              style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
              • {item}
            </Text>
          ))}
        </SectionCard>

        <SectionCard title="Development progress" isDarkMode={isDarkMode}>
          {DEVELOPMENT_ITEMS.map(item => (
            <Text
              key={item}
              style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
              • {item}
            </Text>
          ))}
        </SectionCard>

        <SectionCard title="Native Android bridge" isDarkMode={isDarkMode}>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            {statusLabel}
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            Source of prototype detections: {latestFrame?.source ?? 'js-fallback'}
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            Capabilities:{' '}
            {capabilities
              ? `${capabilities.plannedCameraStack} + ${capabilities.plannedEngine} (events: ${
                  capabilities.detectionEvents ? 'yes' : 'no'
                })`
              : 'loading'}
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            Last frame: {latestFrame ? `${latestFrame.frameId} @ ${latestFrame.timestampMs}` : 'none yet'}
          </Text>

          {!status?.cameraPermissionGranted ? (
            <View style={styles.buttonRow}>
              <Button title="Request camera permission" onPress={requestCameraPermission} />
            </View>
          ) : null}
        </SectionCard>

        <SectionCard title="Live scanner stage" isDarkMode={isDarkMode}>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            Tap the highlighted region for a detected code. If camera permission is granted on
            Android, the stage uses a live native preview. Otherwise it falls back to the mock
            frame for development.
          </Text>

          <ScannerStage
            frame={latestFrame}
            detections={overlayDetections}
            selectedId={selectedBarcode?.id}
            onSelect={selectBarcode}
          />

          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            {selectedBarcode
              ? `Selected: ${selectedBarcode.format} — ${selectedBarcode.text ?? '<binary>'}`
              : 'Selected: nothing yet'}
          </Text>

          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            Detected count: {overlayDetections.length}
          </Text>

          <View style={styles.buttonRow}>
            <Button title="Clear selection" onPress={clearSelection} />
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 20,
  },
  light: {
    backgroundColor: '#f5f7fb',
  },
  dark: {
    backgroundColor: '#0f1218',
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  cardLine: {
    fontSize: 15,
    lineHeight: 22,
  },
  buttonRow: {
    alignItems: 'flex-start',
    marginTop: 6,
  },
  textLight: {
    color: '#141821',
  },
  textDark: {
    color: '#f4f7ff',
  },
  textMutedLight: {
    color: '#4c5567',
  },
  textMutedDark: {
    color: '#afb7c8',
  },
});

export default App;
