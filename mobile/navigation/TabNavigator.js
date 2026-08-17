// PoolsEye — Tab Navigator
// Floating white bar — soft blue active pill (matches dashboard reference)

import React, { useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Image,
} from 'react-native';
import { colors, radius, shadow, typography } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';

import AlertsScreen  from '../screen/AlertsScreen';
import LogScreen     from '../screen/LogScreen';
import ProfileScreen from '../screen/ProfileScreen';
import AppShell      from '../components/AppShell';

const IDLE_ICON = '#8FA3B8';
const ACTIVE_ICON = colors.accent;

const TAB_ICONS = {
  home: require('../assets/icons/nav-home.png'),
  alerts: require('../assets/icons/nav-alerts.png'),
  profile: require('../assets/icons/nav-profile.png'),
};

function TabIcon({ name, color, hasBadge, badgeCount }) {
  return (
    <View style={iconStyles.iconWrap}>
      <Image
        source={TAB_ICONS[name]}
        style={[iconStyles.iconImage, { tintColor: color }]}
        resizeMode="contain"
      />
      {hasBadge ? (
        <View style={iconStyles.badge}>
          <Text style={iconStyles.badgeText}>{badgeCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

function HomeIcon({ color }) {
  return <TabIcon name="home" color={color} />;
}

function BellIcon({ color, hasBadge, badgeCount }) {
  return (
    <TabIcon
      name="alerts"
      color={color}
      hasBadge={hasBadge}
      badgeCount={badgeCount}
    />
  );
}

function PersonIcon({ color }) {
  return <TabIcon name="profile" color={color} />;
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
        return <HomeIcon color={iconColor} />;
      case 'alerts':
        return (
          <BellIcon
            color={iconColor}
            hasBadge={!isActive && alertBadgeCount > 0}
            badgeCount={alertBadgeCount}
          />
        );
      case 'profile':
        return <PersonIcon color={iconColor} />;
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
  iconImage: {
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
