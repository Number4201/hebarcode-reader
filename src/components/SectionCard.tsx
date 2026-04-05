import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

type Props = {
  title: string;
  isDarkMode: boolean;
  children: React.ReactNode;
};

export function SectionCard({title, isDarkMode, children}: Props) {
  return (
    <View style={[styles.card, isDarkMode ? styles.cardDark : styles.cardLight]}>
      <Text style={[styles.title, isDarkMode ? styles.textDark : styles.textLight]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  textLight: {
    color: '#141821',
  },
  textDark: {
    color: '#f4f7ff',
  },
});
