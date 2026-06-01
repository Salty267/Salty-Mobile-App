import React from 'react';
import { View, ActivityIndicator } from 'react-native';

// Deep link handling is done in _layout.tsx. This screen is just a visual
// placeholder shown while Supabase processes the auth redirect.
export default function AuthCallback(): React.JSX.Element {
  return (
    <View style={{ flex: 1, backgroundColor: '#eef0fb', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#4f6cf2" />
    </View>
  );
}
