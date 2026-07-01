// PoolsEye — Tab Navigator
// Floating pill tab bar — icon circles, teal active state, safe-area aware

import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet,
} from 'react-native';
import { colors, radius } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

import AlertsScreen  from '../screen/AlertsScreen';
import ZonesScreen   from '../screen/ZonesScreen';
import LogScreen     from '../screen/LogScreen';
import ProfileScreen from '../screen/ProfileScreen';
import AppShell      from '../components/AppShell';

function BellIcon({ color, filled, hasBadge, badgeCount }) {
  return (
    <View style={iconStyles.iconWrap}>
      <View
        style={[
          iconStyles.bellBody,
          filled
            ? { backgroundColor: color, borderColor: color }
            : { backgroundColor: 'transparent', borderColor: color },
        ]}
      />
      <View style={[iconStyles.bellTop, { backgroundColor: color }]} />
      <View style={[iconStyles.bellClapper, { backgroundColor: color }]} />
      {hasBadge && (
        <View style={iconStyles.badge}>
          <Text style={iconStyles.badgeText}>{badgeCount}</Text>
        </View>
      )}
    </View>
  );
}

function ShieldIcon({ color, filled }) {
  return (
    <View style={iconStyles.iconWrap}>
      <View
        style={[
          iconStyles.shield,
          filled
            ? { backgroundColor: color, borderColor: color }
            : { backgroundColor: 'transparent', borderColor: color },
        ]}
      >
        {filled ? (
          <View style={[iconStyles.shieldInner, { backgroundColor: '#FFFFFF' }]} />
        ) : (
          <View style={[iconStyles.shieldInner, { backgroundColor: color }]} />
        )}
      </View>
    </View>
  );
}

function ClipboardIcon({ color, filled }) {
  const lineColor = filled ? '#FFFFFF' : color;
  return (
    <View style={iconStyles.iconWrap}>
      <View
        style={[
          iconStyles.clipboard,
          filled
            ? { backgroundColor: color, borderColor: color }
            : { backgroundColor: 'transparent', borderColor: color },
        ]}
      >
        {[0, 1, 2].map((i) => (
          <View key={i} style={[iconStyles.clipLine, { backgroundColor: lineColor, width: i === 2 ? 8 : 12 }]} />
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
  { key: 'alerts',  label: 'Alerts'  },
  { key: 'zones',   label: 'Zones'   },
  { key: 'log',     label: 'Log'     },
  { key: 'profile', label: 'Profile' },
];

export default function TabNavigator({ alertBadgeCount = 2 }) {
  const [active, setActive] = useState('alerts');
  const { tabBarPaddingBottom, tabBarPaddingHorizontal, horizontalInset } = useLayoutInsets();

  const screens = {
    alerts:  <AlertsScreen />,
    zones:   <ZonesScreen />,
    log:     <LogScreen />,
    profile: <ProfileScreen />,
  };

  const renderIcon = (key, isActive, pressed) => {
    const filled = isActive || pressed;
    const iconColor = filled ? colors.accent : colors.textTertiary;
    switch (key) {
      case 'alerts':
        return (
          <BellIcon
            color={iconColor}
            filled={filled}
            hasBadge={!isActive && alertBadgeCount > 0}
            badgeCount={alertBadgeCount}
          />
        );
      case 'zones':   return <ShieldIcon color={iconColor} filled={filled} />;
      case 'log':     return <ClipboardIcon color={iconColor} filled={filled} />;
      case 'profile': return <PersonIcon color={iconColor} filled={filled} />;
      default:        return null;
    }
  };

  return (
    <View style={styles.root}>
      <AppShell />

      <View style={[styles.screenArea, { paddingHorizontal: horizontalInset }]}>
        {screens[active]}
      </View>

      <View
        style={[
          styles.tabBarAnchor,
          {
            marginBottom: tabBarPaddingBottom,
            marginHorizontal: tabBarPaddingHorizontal,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.tabBarPill}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Pressable
                key={tab.key}
                style={styles.tabButton}
                onPress={() => setActive(tab.key)}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
              >
                {({ pressed }) => renderIcon(tab.key, isActive, pressed)}
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
    width: 24,
    height: 24,
  },
  bellBody: {
    width: 14,
    height: 11,
    borderRadius: 7,
    borderWidth: 1.8,
    marginTop: 3,
  },
  bellTop: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    top: 2,
  },
  bellClapper: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    bottom: 1,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.alarm,
    borderWidth: 1.5,
    borderColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 7.5,
    fontWeight: '700',
    color: '#fff',
  },
  shield: {
    width: 14,
    height: 16,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  shieldInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  clipboard: {
    width: 14,
    height: 16,
    borderRadius: 2,
    borderWidth: 1.5,
    marginTop: 5,
    paddingTop: 4,
    paddingHorizontal: 2,
    gap: 2.5,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  clipLine: {
    height: 1.5,
    borderRadius: 1,
    marginBottom: 2,
  },
  clipTop: {
    position: 'absolute',
    top: 2,
    width: 7,
    height: 3,
    borderRadius: 1.5,
  },
  personHead: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.6,
    marginBottom: 2,
  },
  personBody: {
    width: 14,
    height: 7,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderWidth: 1.6,
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
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: colors.bgPanel,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#141824',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
});
