import React from 'react';
import {Pressable, ScrollView, StatusBar, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {SettingToggleRow} from '../components';
import {buildXmlPreview, describeXmlLayoutConfig} from '../expeditions';
import {DEFAULT_SETTINGS} from '../models';
import type {ExpeditionRecord, SettingsState, StorageStatus} from '../models';
import {styles} from '../styles';

type Props = {
  activeExpedition: ExpeditionRecord | null;
  exportStatus: string | null;
  hasExportableData: boolean;
  importStatus: string | null;
  onBack: () => void;
  onExportXml: () => void;
  onImportXmlConfig: () => void;
  onPatchSettings: (patch: Partial<SettingsState>) => void;
  settings: SettingsState;
  storageLabel: string;
  storageStatus: StorageStatus;
};

export function SettingsScreen({
  activeExpedition,
  exportStatus,
  hasExportableData,
  importStatus,
  onBack,
  onExportXml,
  onImportXmlConfig,
  onPatchSettings,
  settings,
  storageLabel,
  storageStatus,
}: Props) {
  const xmlConfigState = describeXmlLayoutConfig(settings);

  return (
    <View style={styles.root}>
      <StatusBar animated backgroundColor="transparent" barStyle="light-content" translucent />
      <SafeAreaView style={styles.pageSafeArea}>
        <View style={styles.pageHeader}>
          <Pressable onPress={onBack} style={styles.topActionButton}>
            <Text style={styles.topActionText}>Menu</Text>
          </Pressable>
          <View style={styles.pageHeaderTextWrap}>
            <Text style={styles.pageEyebrow}>NASTAVENÍ</Text>
            <Text style={styles.pageTitle}>Export, skener i chování aplikace</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
          <View style={styles.settingsPanel}>
            <Text style={styles.settingsSectionTitle}>XML export</Text>
            <Text style={styles.settingsHint}>
              Připrav si formát exportu tak, aby seděl na expediční proces bez dalšího ručního přepisování.
            </Text>

            <Text style={styles.inputLabel}>Root tag exportu</Text>
            <TextInput
              onChangeText={value => onPatchSettings({xmlRootTag: value || 'Expedice'})}
              placeholder="Expedice"
              placeholderTextColor="rgba(210,224,235,0.34)"
              style={styles.textInput}
              value={settings.xmlRootTag}
            />

            <SettingToggleRow
              description="Vhodné pro čitelnost a rychlou kontrolu exportu"
              label="Pretty print XML"
              onValueChange={value => onPatchSettings({xmlPrettyPrint: value})}
              value={settings.xmlPrettyPrint}
            />
            <SettingToggleRow
              description="Usnadní zpětné dohledání konkrétní dávky"
              label="Přidat timestamp exportu"
              onValueChange={value => onPatchSettings({xmlIncludeTimestamp: value})}
              value={settings.xmlIncludeTimestamp}
            />
            <SettingToggleRow
              description="Do exportu připraví i agregované množství položek"
              label="Počítat souhrn množství"
              onValueChange={value => onPatchSettings({xmlIncludeQuantityTotals: value})}
              value={settings.xmlIncludeQuantityTotals}
            />

            <Text style={styles.inputLabel}>Konfigurační soubor I6 (JSON)</Text>
            <Text style={styles.settingsHint}>
              Vlož obsah konfiguračního souboru, který určí tagy, atributy a strukturu výsledného XML.
            </Text>
            <TextInput
              multiline
              onChangeText={value => onPatchSettings({xmlLayoutConfigText: value})}
              placeholder="Vlož JSON konfiguraci pro I6 export"
              placeholderTextColor="rgba(210,224,235,0.34)"
              style={[styles.textInput, styles.configTextInput]}
              textAlignVertical="top"
              value={settings.xmlLayoutConfigText}
            />
            <View style={styles.actionRow}>
              <Pressable
                onPress={onImportXmlConfig}
                style={[styles.secondaryButton, styles.flexButton]}>
                <Text style={styles.secondaryButtonText}>Importovat config soubor</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  onPatchSettings({xmlLayoutConfigText: DEFAULT_SETTINGS.xmlLayoutConfigText})
                }
                style={[styles.secondaryButton, styles.flexButton]}>
                <Text style={styles.secondaryButtonText}>Předvyplnit I6 profil</Text>
              </Pressable>
            </View>
            <Text
              style={[
                styles.exportStatusText,
                !xmlConfigState.isValid ? styles.storageStatusValueError : null,
              ]}>
              {xmlConfigState.message}
            </Text>
            {importStatus ? <Text style={styles.exportStatusText}>{importStatus}</Text> : null}
          </View>

          <View style={styles.settingsPanel}>
            <Text style={styles.settingsSectionTitle}>Aplikace</Text>
            <SettingToggleRow
              description="Rychlejší tok práce při dávkovém expedování"
              label="Po uložení zpět do menu"
              onValueChange={value => onPatchSettings({autoReturnToMenuAfterSave: value})}
              value={settings.autoReturnToMenuAfterSave}
            />
            <SettingToggleRow
              description="Chytřejší skenovací profil s lepším chováním v horších podmínkách"
              label="Asistovaný režim skeneru"
              onValueChange={value => onPatchSettings({scannerAssistMode: value})}
              value={settings.scannerAssistMode}
            />
            <View style={styles.storageStatusRow}>
              <Text style={styles.storageStatusLabel}>Lokální perzistence</Text>
              <Text
                style={[
                  styles.storageStatusValue,
                  storageStatus === 'error' ? styles.storageStatusValueError : null,
                ]}>
                {storageLabel}
              </Text>
            </View>
          </View>

          <View style={styles.settingsPanel}>
            <Text style={styles.settingsSectionTitle}>Náhled exportu</Text>
            <Text style={styles.codePreview}>{buildXmlPreview(settings, activeExpedition)}</Text>
            <View style={styles.actionRow}>
              <Pressable
                disabled={!hasExportableData}
                onPress={onExportXml}
                style={[
                  styles.primaryButton,
                  styles.flexButton,
                  !hasExportableData ? styles.primaryButtonDisabled : null,
                ]}>
                <Text style={styles.primaryButtonText}>Exportovat XML</Text>
              </Pressable>
            </View>
            <Text style={styles.exportStatusText}>
              {exportStatus ??
                (hasExportableData
                  ? 'Export vytvoří skutečný XML soubor do zařízení.'
                  : 'Nejdřív vytvoř nebo dokonči expedici, aby bylo co exportovat.')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
