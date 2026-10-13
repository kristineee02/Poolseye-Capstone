import React from 'react';
import { Image } from 'react-native';

const cameraIcon = require('../assets/icons/camera.png');

export default function CameraIcon({ color = '#FFFFFF', size = 16 }) {
  return (
    <Image
      source={cameraIcon}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}
