import React from 'react';
import {FlatList, Pressable, StatusBar, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {OverviewTile} from '../components';
import {buildExpeditionTitle, formatDateTime} from '../expeditions';
import type {ArchiveSummary, ExpeditionRecord} from '../models';
import {styles} from '../styles';

type Props = {
  activeExpeditionPresent: boolean;
  archive: ExpeditionRecord[];
  archiveSummary: ArchiveSummary;
  onBack: () => void;
  xmlRootTag: string;
};

export function ArchiveScreen({
  activeExpeditionPresent,
  archive,
  archiveSummary,
  onBack,
  xmlRootTag,
}: Props) {
  return (
    <View style={styles.root}>
      <StatusBar animated backgroundColor="transparent" barStyle="light-content" translucent />
      <SafeAreaView style={styles.pageSafeArea}>
        <View style={styles.pageHeader}>
          <Pressable onPress={onBack} style={styles.topActionButton}>
            <Text style={styles.topActionText}>Menu</Text>
          </Pressable>
          <View style={styles.pageHeaderTextWrap}>
            <Text style={styles.pageEyebrow}>ARCHIV EXPEDICÍ</Text>
            <Text style={styles.pageTitle}>Přehled uložených zásilek</Text>
          </View>
        </View>

        <View style={styles.overviewRow}>
          <OverviewTile label="Expedice" value={String(archiveSummary.totalRecords)} />
          <OverviewTile label="Celkem kusů" value={String(archiveSummary.totalUnits)} />
          <OverviewTile label="Rozpracováno" value={activeExpeditionPresent ? 'ANO' : 'NE'} />
        </View>

        <FlatList
          contentContainerStyle={styles.archiveListContent}
          data={archive}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>Archiv je zatím prázdný</Text>
              <Text style={styles.emptyStateText}>
                Po dokončení první expedice se sem uloží souhrn naskenovaných položek.
              </Text>
            </View>
          }
          renderItem={({item}) => {
            const totalUnits = item.items.reduce((sum, current) => sum + current.quantity, 0);

            return (
              <View style={styles.archiveCard}>
                <View style={styles.archiveCardHeader}>
                  <View>
                    <Text style={styles.archiveCardTitle}>{buildExpeditionTitle(item)}</Text>
                    <Text style={styles.archiveCardMeta}>{formatDateTime(item.updatedAtMs)}</Text>
                  </View>
                  <Text style={styles.archiveBadge}>{totalUnits} ks</Text>
                </View>
                <Text style={styles.archiveCardSummary}>
                  {item.items.length} unikátních položek • XML root: &lt;{xmlRootTag}&gt;
                </Text>
                <View style={styles.archivePreviewList}>
                  {item.items.slice(0, 3).map(scan => (
                    <View key={scan.id} style={styles.archivePreviewRow}>
                      <Text style={styles.archivePreviewFormat}>{scan.format}</Text>
                      <Text numberOfLines={1} style={styles.archivePreviewText}>
                        {scan.text}
                      </Text>
                      <Text style={styles.archivePreviewCount}>{scan.quantity} ks</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </View>
  );
}
