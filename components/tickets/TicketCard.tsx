import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { Ticket } from '@/types';
import { scaleFont, sp } from '@/lib/layout';

interface TicketCardProps {
  ticket: Ticket;
  onPress?: () => void;
}

export default function TicketCard({ ticket, onPress }: TicketCardProps): React.JSX.Element {
  return (
    <TouchableOpacity
      className="bg-card rounded-2xl border-l-4 border-ember mx-4 mb-3"
      style={{ padding: sp(16) }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text className="font-bebas text-cream mb-0.5" style={{ fontSize: scaleFont(20) }}>
        {ticket.event?.name ?? 'Unknown Event'}
      </Text>
      <Text className="font-sans text-muted mb-2" style={{ fontSize: scaleFont(14) }}>
        {ticket.event?.venue?.name ?? ''} · {ticket.event?.venue?.city ?? ''}
      </Text>
      <View className="flex-row justify-between items-center">
        <Text className="font-sans text-gold" style={{ fontSize: scaleFont(14) }}>
          {ticket.event?.event_date
            ? new Date(ticket.event.event_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : ''}
        </Text>
        <View className="bg-ember rounded-full" style={{ paddingHorizontal: sp(12), paddingVertical: sp(2) }}>
          <Text className="font-bebas text-cream tracking-wider" style={{ fontSize: scaleFont(12) }}>
            {ticket.event?.category?.toUpperCase() ?? 'EVENT'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
