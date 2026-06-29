export const metricStrip = [
  { label: 'Mean average precision', value: '88.4', unit: '% mAP', trend: '↑ 1.2%' },
  { label: 'Precision / Recall', value: '0.91', unit: '/ 0.87', trend: '↑ stable' },
  { label: 'F1-score', value: '0.89', unit: 'score', trend: '↑ 0.01' },
]

export const weeklyDetections = [
  { label: 'W1', value: 5 },
  { label: 'W2', value: 7 },
  { label: 'W3', value: 4 },
  { label: 'W4', value: 9 },
  { label: 'W5', value: 6 },
  { label: 'W6', value: 8 },
  { label: 'W7', value: 3 },
  { label: 'W8', value: 5 },
]

export const falsePositiveTrend = [9.4, 8.1, 7.0, 6.0, 5.0, 4.2, 3.6, 3.1]

// 24 values, one per hour, relative intensity 0-5 for the heatmap
export const peakRiskHours = [
  0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 5, 5, 4, 5, 5, 4, 3, 2, 1, 1, 0, 0, 0,
]
