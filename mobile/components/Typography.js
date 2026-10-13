import React, { forwardRef } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
} from 'react-native';
import { typography } from '../theme/tokens';

function familyForWeight(weight) {
  const numericWeight = typeof weight === 'string'
    ? Number.parseInt(weight, 10)
    : weight;

  if (weight === 'bold' || numericWeight >= 800) return typography.fonts.extraBold;
  if (numericWeight >= 700) return typography.fonts.bold;
  if (numericWeight >= 600) return typography.fonts.semiBold;
  if (numericWeight >= 500) return typography.fonts.medium;
  return typography.fonts.regular;
}

function interStyle(style) {
  const resolved = StyleSheet.flatten(style) || {};
  return {
    fontFamily: familyForWeight(resolved.fontWeight),
    // Each Inter weight is registered as its own native family.
    fontWeight: 'normal',
  };
}

export const Text = forwardRef(function Text({ style, ...props }, ref) {
  return <NativeText ref={ref} style={[style, interStyle(style)]} {...props} />;
});

export const TextInput = forwardRef(function TextInput({ style, ...props }, ref) {
  return <NativeTextInput ref={ref} style={[style, interStyle(style)]} {...props} />;
});
