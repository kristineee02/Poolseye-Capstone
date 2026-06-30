// PoolsEye — Tab Navigator
// Bottom tab bar matching the web NavRail's style:
// teal accent for active, muted for inactive, alarm badge on Alerts tab.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

import AlertsScreen  from '../screen/AlertsScreen';
import ZonesScreen   from '../screen/ZonesScreen';
import LogScreen     from '../screen/LogScreen';
import ProfileScreen from '../screen/ProfileScreen';
import AppShell      from '../components/AppShell';

// ── Tab icon SVGs (inline paths via View shapes) ──────────────────────────────
// React Native doesn't ship SVG; these are tiny symbolic representations
// using View + border tricks. In production, use react-native-svg or
// @expo/vector-icons (MaterialCommunityIcons / Ionicons).

function BellIcon({ active, hasBadge, badgeCount }) {
  const c = active ? colors.accentStrong : colors.textTertiary;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
      {/* Bell body */}
      <View style={[iconStyles.bellBody, { borderColor: c }]} />
      {/* Bell top */}
      <View style={[iconStyles.bellTop,  { backgroundColor: c }]} />
      {/* Bell clapper */}
      <View style={[iconStyles.bellClapper, { backgroundColor: c }]} />
      {/* Badge */}
      {hasBadge && (
        <View style={iconStyles.badge}>
          <Text style={iconStyles.badgeText}>{badgeCount}</Text>
        </View>
      )}
    </View>
  );
}

function ShieldIcon({ active }) {
  const c = active ? colors.accentStrong : colors.textTertiary;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
      <View style={[iconStyles.shield, { borderColor: c }]}>
        <View style={[iconStyles.shieldInner, { backgroundColor: c }]} />
      </View>
    </View>
  );
}

function ClipboardIcon({ active }) {
  const c = active ? colors.accentStrong : colors.textTertiary;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
      <View style={[iconStyles.clipboard, { borderColor: c }]}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[iconStyles.clipLine, { backgroundColor: c, width: i === 2 ? 8 : 12 }]} />
        ))}
      </View>
      <View style={[iconStyles.clipTop, { backgroundColor: c }]} />
    </View>
  );
}

function PersonIcon({ active }) {
  const c = active ? colors.accentStrong : colors.textTertiary;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
      <View style={[iconStyles.personHead, { borderColor: c }]} />
      <View style={[iconStyles.personBody, { borderColor: c }]} />
    </View>
  );
}

const TABS = [
  { key: 'alerts',  label: 'Alerts'  },
  { key: 'zones',   label: 'Zones'   },
  { key: 'log',     label: 'Log'     },
  { key: 'profile', label: 'Profile' },
];

// ── Main navigator ────────────────────────────────────────────────────────────
export default function TabNavigator({ alertBadgeCount = 2 }) {
  const [active, setActive] = useState('alerts');

  const screens = {
    alerts:  <AlertsScreen />,
    zones:   <ZonesScreen />,
    log:     <LogScreen />,
    profile: <ProfileScreen />,
  };

  const renderIcon = (key, isActive) => {
    switch (key) {
      case 'alerts':
        return (
          <BellIcon
            active={isActive}
            hasBadge={alertBadgeCount > 0}
            badgeCount={alertBadgeCount}
          />
        );
      case 'zones':   return <ShieldIcon active={isActive} />;
      case 'log':     return <ClipboardIcon active={isActive} />;
      case 'profile': return <PersonIcon active={isActive} />;
      default:        return null;
    }
  };

  return (
    <View style={styles.root}>
      {/* Shared app header */}
      <AppShell />

      {/* Screen content */}
      <View style={styles.screenArea}>
        {screens[active]}
      </View>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const isActive = tab.key === active;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActive(tab.key)}
              activeOpacity={0.8}
            >
              {renderIcon(tab.key, isActive)}
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Icon micro-styles ─────────────────────────────────────────────────────────
const iconStyles = StyleSheet.create({
  // Bell
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
    top: 0,
    right: -2,
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

  // Shield
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

  // Clipboard
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

  // Person
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

// ── Tab bar styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  screenArea: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgPanel,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 8,
    paddingBottom: 20,   // extra for home indicator on iPhone
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: radius.md,
    gap: 3,
  },
  tabItemActive: {
    // background tint handled per-icon
  },
  tabLabel: {
    fontSize: typography.xs,
    fontWeight: '500',
    color: colors.textTertiary,
  },
  tabLabelActive: {
    color: colors.accentStrong,
    fontWeight: '700',
  },
});