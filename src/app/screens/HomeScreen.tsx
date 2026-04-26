import React from 'react';
import {ScrollView, StatusBar, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {MenuActionCard, OverviewTile} from '../components';
import {styles} from '../styles';
import {AppLogo} from '../../components/AppLogo';
import {APP_HEADLINE, APP_NAME} from '../../content';
import type {DetectionSource} from '../../scanner/types';

type Props = {
  archiveCount: number;
  activeExpeditionLabel: string;
  detectionSource: DetectionSource;
  scannerBadgeLabel: string;
  onOpenExpedition: () => void;
  onOpenDiagnostics: () => void;
  onOpenArchive: () => void;
  onOpenSettings: () => void;
};

export function HomeScreen({
  archiveCount,
  activeExpeditionLabel,
  detectionSource,
  scannerBadgeLabel,
  onOpenExpedition,
  onOpenDiagnostics,
  onOpenArchive,
  onOpenSettings,
}: Props) {
  const isMockMode = detectionSource === 'mock';

  return (
    <View style={styles.root}>
      <StatusBar animated backgroundColor="transparent" barStyle="light-content" translucent />
      <SafeAreaView style={styles.pageSafeArea}>
        <ScrollView
          contentContainerStyle={styles.homeContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <AppLogo compact size={48} />
              <View style={[styles.liveBadge, isMockMode ? styles.liveBadgeMock : null]}>
                <View style={[styles.liveDot, isMockMode ? styles.liveDotMock : null]} />
                <Text numberOfLines={2} style={styles.liveBadgeText}>
                  {scannerBadgeLabel}
                </Text>
              </View>
            </View>

            <Text style={styles.heroTitle}>{APP_NAME}</Text>
            <Text style={styles.heroSubtitle}>{APP_HEADLINE}</Text>

            <View style={styles.heroStatsRow}>
              <OverviewTile label="Archiv" value={String(archiveCount)} />
              <OverviewTile
                label="Rozpracováno"
                value={activeExpeditionLabel.includes('Rozpracovaná') ? 'ANO' : 'NE'}
              />
              <OverviewTile label="Stack" value={isMockMode ? 'SAMPLE' : 'LIVE'} />
            </View>
          </View>

          <View style={styles.menuStack}>
            <MenuActionCard
              accent="#7ef2ca"
              index="01"
              onPress={onOpenExpedition}
              subtitle={activeExpeditionLabel}
              title="Nová expedice"
            />
            <MenuActionCard
              accent="#ff6b6b"
              index="02"
              onPress={onOpenDiagnostics}
              subtitle="Preview, oprávnění, CameraX bind, frame counter a poslední chyba"
              title="Diagnostika skeneru"
            />
            <MenuActionCard
              accent="#f7b248"
              index="03"
              onPress={onOpenArchive}
              subtitle="Historie uložených expedic a rychlý přehled položek"
              title="Archiv expedicí"
            />
            <MenuActionCard
              accent="#8bb7ff"
              index="04"
              onPress={onOpenSettings}
              subtitle="XML export a přehledné provozní nastavení aplikace"
              title="Nastavení"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
