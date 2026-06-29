export const site = {
  name: 'Sablan Residence — South Patio Pool',
  edgeNodeOnline: true,
  mode: 'Offline / local-only',
}

export const telemetry = {
  fps: 13,
  latencyMs: 340,
  confidence: 0.91,
}

export const kpis = [
  { label: 'Inference speed', value: '13', unit: 'FPS', trend: '↑ stable', trendDir: 'up', fill: 65, color: 'accent' },
  { label: 'Detection accuracy', value: '88.4', unit: '% mAP', trend: '↑ 0.6%', trendDir: 'up', fill: 88, color: 'safe' },
  { label: 'Alert response time', value: '340', unit: 'ms', trend: '↓ 40ms', trendDir: 'up', fill: 68, color: 'warn' },
  { label: 'False positive rate', value: '3.1', unit: '%', trend: '↑ 0.2%', trendDir: 'down', fill: 14, color: 'alarm' },
]

export const todaySummary = [
  { label: 'Intrusions flagged', value: 1 },
  { label: 'Supervised visits', value: 6 },
  { label: 'PIR triggers', value: 14 },
  { label: 'Avg. response', value: '340ms' },
]

export const networkDevices = [
  { name: 'Orange Pi Zero 3 (edge)', status: 'online' },
  { name: 'ESP32 alarm node', status: 'online' },
  { name: 'MQTT broker (local)', ping: '12ms' },
]
