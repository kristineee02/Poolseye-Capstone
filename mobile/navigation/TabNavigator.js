// PoolsEye — Tab Navigator
// Floating white bar — soft blue active pill (matches dashboard reference)

import React, { useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadow, typography } from '../theme/tokens';
import { useLayoutInsets } from '../hooks/useLayoutInsets';
import { useAlertNotifications } from '../hooks/useAlertNotifications';
import { useAuth } from '../context/AuthContext';

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
          <Text style={iconStyles.badgeText}>
            {badgeCount > 9 ? '9+' : String(badgeCount)}
          </Text>
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
    <Animated.View style={[styles.tabItem, { transform: [{ scale }] }]}>
      <Pressable
        style={styles.tabButton}
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
        {isActive ? (
          <LinearGradient
            colors={colors.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.activePill}
            pointerEvents="none"
          />
        ) : null}
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

export default function TabNavigator() {
  const [active, setActive] = useState('home');
  const [alertBadgeCount, setAlertBadgeCount] = useState(0);
  const { tabBarPaddingBottom, horizontalInset } = useLayoutInsets();
  const { token } = useAuth();
  useAlertNotifications(token, {
    onPendingCount: setAlertBadgeCount,
    onOpenAlert: () => setActive('home'),
  });

  const screens = {
    home: (
      <AlertsScreen
        onViewAllAlerts={() => setActive('alerts')}
        onPendingCountChange={setAlertBadgeCount}
      />
    ),
    alerts: <LogScreen onPendingCountChange={setAlertBadgeCount} />,
    profile: <ProfileScreen />,
  };

  const activeTab = TABS.find((t) => t.key === active) || TABS[0];

  const renderIcon = (key, isActive) => {
    const iconColor = isActive ? '#FFFFFF' : IDLE_ICON;
    switch (key) {
      case 'home':
        return <HomeIcon color={iconColor} />;
      case 'alerts':
        return (
          <BellIcon
            color={iconColor}
            hasBadge={alertBadgeCount > 0}
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
        style={[
          styles.tabBarAnchor,
          { marginBottom: tabBarPaddingBottom, pointerEvents: 'box-none' },
        ]}
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
    marginHorizontal: 12,
    height: 64,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    shadowColor: '#52749D',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 5,
  },
  tabItem: {
    flex: 1,
    maxWidth: 112,
    height: 50,
  },
  tabButton: {
    flex: 1,
    width: '100%',
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.full,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabLabelIdle: {
    color: IDLE_ICON,
  },
});
