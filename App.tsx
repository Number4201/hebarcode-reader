import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, isDarkMode ? styles.dark : styles.light]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
          Hebarcode Reader
        </Text>
        <Text style={[styles.title, isDarkMode ? styles.textDark : styles.textLight]}>
          Multi-barcode selection for Android
        </Text>
        <Text style={[styles.body, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
          This repository is being set up as an open-source React Native app for Scanbot-like
          barcode selection: multiple visible codes, overlays above each symbol, and tap-to-pick
          the exact one the user wants.
        </Text>

        <View style={[styles.card, isDarkMode ? styles.cardDark : styles.cardLight]}>
          <Text style={[styles.cardTitle, isDarkMode ? styles.textDark : styles.textLight]}>
            Planned scanning stack
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            • React Native UI
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            • Android CameraX preview + analysis
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            • ZXing-C++ Android wrapper for multi-barcode decoding
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            • AR-like overlay polygons and tap hit-testing
          </Text>
        </View>

        <View style={[styles.card, isDarkMode ? styles.cardDark : styles.cardLight]}>
          <Text style={[styles.cardTitle, isDarkMode ? styles.textDark : styles.textLight]}>
            Repository hygiene
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            • Apache-2.0 license added
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            • Third-party notices documented
          </Text>
          <Text style={[styles.cardLine, isDarkMode ? styles.textMutedDark : styles.textMutedLight]}>
            • Public GitHub-ready metadata configured
          </Text>
        </View>
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
  card: {
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  cardDark: {
    backgroundColor: '#171b23',
  },
  cardLight: {
    backgroundColor: '#ffffff',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardLine: {
    fontSize: 15,
    lineHeight: 22,
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
