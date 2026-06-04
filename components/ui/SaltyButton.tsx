import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { scale, scaleFont } from '@/lib/layout';

interface SaltyButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  loading?: boolean;
  disabled?: boolean;
}

export default function SaltyButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: SaltyButtonProps): React.JSX.Element {
  const base = 'rounded-xl w-full items-center justify-center';
  const styles = variant === 'primary'
    ? `${base} bg-ember`
    : `${base} border border-cream/30`;

  return (
    <TouchableOpacity
      className={`${styles} ${disabled || loading ? 'opacity-50' : ''}`}
      style={{ height: scale(58) }}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color="#F2EDE3" />
      ) : (
        <Text
          className={`font-bebas tracking-widest ${variant === 'primary' ? 'text-cream' : 'text-cream'}`}
          style={{ fontSize: scaleFont(24) }}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
