// victory-native Web mock - SVGベースの簡易チャート代替
import React from 'react';
import { View, Text } from 'react-native';

export function CartesianChart({ data, children, xKey, yKeys }) {
  const points = {};
  if (yKeys && data) {
    yKeys.forEach((key) => {
      points[key] = data.map((d, i) => ({
        x: i * 10,
        y: d[key] || 0,
        value: d[key] || 0,
      }));
    });
  }

  return React.createElement(
    View,
    { style: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 8, padding: 8 } },
    React.createElement(
      View,
      { style: { flex: 1, width: '100%', justifyContent: 'flex-end' } },
      // Simple bar chart visualization
      data && data.length > 2
        ? React.createElement(
            View,
            { style: { flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 1 } },
            data.slice(-30).map((d, i) => {
              const yKey = yKeys?.[0] || 'y';
              const val = d[yKey] || 0;
              const maxVal = Math.max(...data.map(dd => dd[yKey] || 0), 1);
              const pct = (val / maxVal) * 100;
              return React.createElement(View, {
                key: i,
                style: {
                  flex: 1,
                  height: `${Math.max(2, pct)}%`,
                  backgroundColor: '#00d4ff',
                  borderRadius: 1,
                  opacity: 0.8,
                },
              });
            })
          )
        : React.createElement(
            Text,
            { style: { color: '#8888aa', fontSize: 12 } },
            'Waiting for data...'
          )
    )
  );
}

export function Line() {
  return null;
}

export function Bar() {
  return null;
}
