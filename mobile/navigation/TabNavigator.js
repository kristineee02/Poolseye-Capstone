// PoolsEye — Tab Navigator
// Floating white bar — soft blue active pill (matches dashboard reference)

import React, { useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, shadow, typography } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

import AlertsScreen  from '../screen/AlertsScreen';
import LogScreen     from '../screen/LogScreen';
import ProfileScreen from '../screen/ProfileScreen';
import AppShell      from '../components/AppShell';

const IDLE_ICON = '#8FA3B8';
const ACTIVE_ICON = colors.accent;

function HomeIcon({ color, filled }) {
  return (
    <View style={iconStyles.iconWrap}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 3.2 4.2 9.8V20c0 .66.54 1.2 1.2 1.2h13.2c.66 0 1.2-.54 1.2-1.2V9.8L12 3.2z"
          stroke={color}
          strokeWidth={1.85}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={filled ? color : 'none'}
        />
        <Path
          d="M10.2 21.2V16.2c0-1 .82-1.8 1.8-1.8s1.8.8 1.8 1.8v5"
          stroke={filled ? colors.accentTint : color}
          strokeWidth={1.85}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

function BellIcon({ color, filled, hasBadge, badgeCount }) {
  return (
    <View style={iconStyles.iconWrap}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
          stroke={color}
          strokeWidth={1.85}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={filled ? color : 'none'}
        />
        <Path
          d="M13.73 21a2 2 0 0 1-3.46 0"
          stroke={color}
          strokeWidth={1.85}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {hasBadge ? (
        <View style={iconStyles.badge}>
          <Text style={iconStyles.badgeText}>{badgeCount}</Text>
        </View>
      ) : null}
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

function TabButton({ tab, isActive, onPress, renderIcon }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[styles.tabButton, isActive && styles.tabSlotActive]}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        android_ripple={{
          color: 'rgba(30, 111, 255, 0.12)',
          borderless: false,
          radius: 28,
        }}
        accessibilityRole="button"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: isActive }}
      >
        {renderIcon(tab.key, isActive)}
        <Text
          style={[
            styles.tabLabel,
            isActive ? styles.tabLabelActive : styles.tabLabelIdle,
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const TABS = [
  { key: 'home',    label: 'Home',    title: null,         subtitle: null },
  { key: 'alerts',  label: 'Alerts',  title: 'All Alerts', subtitle: null },
  { key: 'profile', label: 'Profile', title: 'Profile',    subtitle: null },
];

export default function TabNavigator({ alertBadgeCount = 2 }) {
  const [active, setActive] = useState('home');
  const { tabBarPaddingBottom, horizontalInset } = useLayoutInsets();

  const screens = {
    home: (
      <AlertsScreen onViewAllAlerts={() => setActive('alerts')} />
    ),
    alerts:  <LogScreen />,
    profile: <ProfileScreen />,
  };

  const activeTab = TABS.find((t) => t.key === active) || TABS[0];

  const renderIcon = (key, isActive) => {
    const iconColor = isActive ? ACTIVE_ICON : IDLE_ICON;
    switch (key) {
      case 'home':
        return <HomeIcon color={iconColor} filled={isActive} />;
      case 'alerts':
        return (
          <BellIcon
            color={iconColor}
            filled={isActive}
            hasBadge={!isActive && alertBadgeCount > 0}
            badgeCount={alertBadgeCount}
          />
        );
      case 'profile':
        return <PersonIcon color={iconColor} filled={isActive} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.root}>
      <AppShell title={activeTab.title} subtitle={activeTab.subtitle} />

      <View style={[styles.screenArea, { paddingHorizontal: horizontalInset }]}>
        {screens[active]}
      </View>

      <View
        style={[styles.tabBarAnchor, { marginBottom: tabBarPaddingBottom }]}
        pointerEvents="box-none"
      >
        <View style={styles.tabBarPill}>
          {TABS.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              isActive={tab.key === active}
              onPress={() => setActive(tab.key)}
              renderIcon={renderIcon}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.alarm,
    borderWidth: 1.5,
    borderColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  personHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    marginBottom: 1.5,
  },
  personBody: {
    width: 13,
    height: 6.5,
    borderTopLeftRadius: 6.5,
    borderTopRightRadius: 6.5,
    borderWidth: 1.5,
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
    justifyContent: 'space-evenly',
    alignSelf: 'stretch',
    marginHorizontal: 18,
    height: 58,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadow.md,
  },
  tabButton: {
    minWidth: 88,
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabSlotActive: {
    backgroundColor: '#E8F1FF',
    paddingHorizontal: 22,
    minWidth: 96,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  tabLabelIdle: {
    color: IDLE_ICON,
  },
});
