// PoolsEye — Tab Navigator
// Compact floating pill (centered) — blue active circle, like reference

import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, shadow } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

import AlertsScreen  from '../screen/AlertsScreen';
import LogScreen     from '../screen/LogScreen';
import ProfileScreen from '../screen/ProfileScreen';
import AppShell      from '../components/AppShell';

function HomeIcon({ color, filled, hasBadge, badgeCount }) {
  const stroke = filled ? color : color;
  const fill = filled ? color : 'none';

  return (
    <View style={iconStyles.iconWrap}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 3.2 4.2 9.8V20c0 .66.54 1.2 1.2 1.2h13.2c.66 0 1.2-.54 1.2-1.2V9.8L12 3.2z"
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={fill}
        />
        <Path
          d="M10.2 21.2V16.2c0-1 .82-1.8 1.8-1.8s1.8.8 1.8 1.8v5"
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      {hasBadge && (
        <View style={iconStyles.badge}>
          <Text style={iconStyles.badgeText}>{badgeCount}</Text>
        </View>
      )}
    </View>
  );
}

function ClipboardIcon({ color }) {
  return (
    <View style={iconStyles.iconWrap}>
      <View style={[iconStyles.clipboard, { borderColor: color }]}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[iconStyles.clipLine, { backgroundColor: color, width: i === 2 ? 5 : 8 }]}
          />
        ))}
      </View>
      <View style={[iconStyles.clipTop, { backgroundColor: color }]} />
    </View>
  );
}

function PersonIcon({ color, filled }) {
  return (
    <View style={iconStyles.iconWrap}>
      <View
        style={[
          iconStyles.personHead,
          filled
            ? { backgroundColor: color, borderColor: color }
            : { backgroundColor: 'transparent', borderColor: color },
        ]}
      />
      <View
        style={[
          iconStyles.personBody,
          filled
            ? { backgroundColor: color, borderColor: color }
            : { backgroundColor: 'transparent', borderColor: color },
        ]}
      />
    </View>
  );
}

const TABS = [
  { key: 'alerts',  label: 'Home',    title: 'Dashboard',  subtitle: null, showDutyProfile: false },
  { key: 'log',     label: 'Log',     title: 'All Alerts',  subtitle: null, showDutyProfile: false },
  { key: 'profile', label: 'Profile', title: 'Profile',    subtitle: null, showDutyProfile: false },
];

export default function TabNavigator({ alertBadgeCount = 2 }) {
  const [active, setActive] = useState('alerts');
  const { tabBarPaddingBottom, horizontalInset } = useLayoutInsets();

  const screens = {
    alerts:  <AlertsScreen />,
    log:     <LogScreen />,
    profile: <ProfileScreen />,
  };

  const activeTab = TABS.find((t) => t.key === active) || TABS[0];

  const renderIcon = (key, isActive) => {
    const iconColor = isActive ? '#FFFFFF' : colors.textTertiary;
    switch (key) {
      case 'alerts':
        return (
          <HomeIcon
            color={iconColor}
            filled={isActive}
            hasBadge={!isActive && alertBadgeCount > 0}
            badgeCount={alertBadgeCount}
          />
        );
      case 'log':
        return <ClipboardIcon color={iconColor} />;
      case 'profile':
        return <PersonIcon color={iconColor} filled={isActive} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.root}>
      <AppShell
        title={activeTab.title}
        subtitle={activeTab.subtitle}
        showDutyProfile={activeTab.showDutyProfile}
      />

      <View style={[styles.screenArea, { paddingHorizontal: horizontalInset }]}>
        {screens[active]}
      </View>

      <View
        style={[styles.tabBarAnchor, { marginBottom: tabBarPaddingBottom }]}
        pointerEvents="box-none"
      >
        <View style={styles.tabBarPill}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Pressable
                key={tab.key}
                style={({ pressed }) => [
                  styles.tabButton,
                  isActive && styles.tabSlotActive,
                  pressed && !isActive && styles.tabSlotPressed,
                ]}
                onPress={() => setActive(tab.key)}
                android_ripple={{
                  color: 'rgba(30, 111, 255, 0.18)',
                  borderless: false,
                  radius: 22,
                }}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
              >
                {renderIcon(tab.key, isActive)}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.alarm,
    borderWidth: 1.5,
    borderColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: '700',
    color: '#fff',
  },
  clipboard: {
    width: 11,
    height: 13,
    borderRadius: 2,
    borderWidth: 1.4,
    marginTop: 3,
    paddingTop: 2.5,
    paddingHorizontal: 1.5,
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  clipLine: {
    height: 1.2,
    borderRadius: 1,
    marginBottom: 1.4,
  },
  clipTop: {
    position: 'absolute',
    top: 0.5,
    width: 5.5,
    height: 2.5,
    borderRadius: 1.25,
  },
  personHead: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.4,
    marginBottom: 1.5,
  },
  personBody: {
    width: 11,
    height: 5.5,
    borderTopLeftRadius: 5.5,
    borderTopRightRadius: 5.5,
    borderWidth: 1.4,
    borderBottomWidth: 0,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  screenArea: {
    flex: 1,
  },
  tabBarAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.md,
  },
  tabButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabSlotActive: {
    backgroundColor: colors.accent,
  },
  tabSlotPressed: {
    backgroundColor: colors.accentTint,
  },
});
