import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, useWindowDimensions } from 'react-native';

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
  const { width } = useWindowDimensions();
  const fontSize = Math.round(width * 0.062);
  const buttonHeight = Math.round(width * 0.148);

  const base = 'rounded-xl w-full items-center justify-center';
  const styles = variant === 'primary'
    ? `${base} bg-ember`
    : `${base} border border-cream/30`;

  return (
    <TouchableOpacity
      className={`${styles} ${disabled || loading ? 'opacity-50' : ''}`}
      style={{ height: buttonHeight }}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color="#F2EDE3" />
      ) : (
        <Text
          className={`font-bebas tracking-widest ${variant === 'primary' ? 'text-cream' : 'text-cream'}`}
          style={{ fontSize }}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
