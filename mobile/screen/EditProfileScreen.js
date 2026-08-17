// PoolsEye — Edit Profile (photo + name)

import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography, shadow, touch } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { site } from '../data';
import CameraIcon from '../components/CameraIcon';

function getInitials(name, fallback = 'LG') {
  if (!name || typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function BackArrow({ color = colors.accent, size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 6 9 12l6 6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function EditProfileScreen({ onCancel }) {
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [photoUri, setPhotoUri] = useState(user?.photoUri || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const initials = getInitials(name, user?.initials || 'LG');

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access so you can update your profile picture.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    if (trimmed.length < 2) {
      setError('Enter at least 2 characters for your name.');
      return;
    }

    setSaving(true);
    setError('');
    const result = await updateProfile({
      name: trimmed,
      photoUri,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error || 'Could not save profile.');
      return;
    }
    onCancel?.();
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onCancel}
          activeOpacity={0.75}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <BackArrow />
        </TouchableOpacity>

        <Text style={styles.title}>Edit Profile</Text>
        <Text style={styles.subtitle}>Update your photo and display name</Text>

        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={pickPhoto}
          activeOpacity={0.85}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImage} />
          ) : (
            <LinearGradient
              colors={colors.brandGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          )}
          <View style={styles.cameraBadge}>
            <CameraIcon size={14} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <Text style={styles.photoHint}>Tap to change picture</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.input, styles.inputReadonly]}>
            <Text style={styles.readonlyText}>{user?.email || '—'}</Text>
          </View>
          <Text style={styles.helper}>Email is managed by your admin</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Assignment</Text>
          <View style={[styles.input, styles.inputReadonly]}>
            <Text style={styles.readonlyText}>
              {user?.role || 'On-duty lifeguard · primary'}
            </Text>
          </View>
          <Text style={styles.helper}>{site.name || 'Main Pool'} · On duty</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveText}>Save changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} activeOpacity={0.8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: -4,
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
    lineHeight: 20,
  },
  avatarWrap: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    marginTop: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.bgInset,
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    alignSelf: 'center',
    fontSize: typography.sm,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  input: {
    minHeight: touch.comfortable,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
    paddingHorizontal: 14,
    fontSize: typography.md,
    color: colors.textPrimary,
    fontWeight: '500',
    ...shadow.sm,
  },
  inputReadonly: {
    justifyContent: 'center',
    backgroundColor: colors.bgInset,
  },
  readonlyText: {
    fontSize: typography.md,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  helper: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  error: {
    color: colors.alarm,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 8,
    minHeight: 52,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: typography.md,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelText: {
    color: colors.accent,
    fontSize: typography.base,
    fontWeight: '700',
  },
});
