import React from 'react';
import {Pressable, Switch, Text, View} from 'react-native';
import {styles} from './styles';

type MenuActionCardProps = {
  accent: string;
  index: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export const MenuActionCard = React.memo(function MenuActionCard({
  accent,
  index,
  title,
  subtitle,
  onPress,
}: MenuActionCardProps) {
  return (
    <Pressable
      accessibilityLabel={title}
      onPress={onPress}
      style={({pressed}) => [
        styles.menuCard,
        {borderColor: accent},
        pressed ? styles.menuCardPressed : null,
      ]}>
      <View style={styles.menuCardHeader}>
        <Text style={[styles.menuCardIndex, {color: accent}]}>{index}</Text>
        <View style={[styles.menuCardAccent, {backgroundColor: accent}]} />
      </View>
      <Text style={styles.menuCardTitle}>{title}</Text>
      <Text style={styles.menuCardSubtitle}>{subtitle}</Text>
    </Pressable>
  );
});

export function OverviewTile({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.overviewTile}>
      <Text style={styles.overviewLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.overviewValue}>
        {value}
      </Text>
    </View>
  );
}

export function InfoCard({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoCardLabel}>{label}</Text>
      <Text style={styles.infoCardValue}>{value}</Text>
    </View>
  );
}

export function SettingToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingTextWrap}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        onValueChange={onValueChange}
        thumbColor={value ? '#061710' : '#f5f9fb'}
        trackColor={{false: 'rgba(255,255,255,0.16)', true: '#7ef2ca'}}
        value={value}
      />
    </View>
  );
}
