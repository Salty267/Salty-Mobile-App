import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { Ticket } from '@/types';

interface TicketCardProps {
  ticket: Ticket;
  onPress?: () => void;
}

export default function TicketCard({ ticket, onPress }: TicketCardProps): React.JSX.Element {
  return (
    <TouchableOpacity
      className="bg-card rounded-2xl p-4 border-l-4 border-ember mx-4 mb-3"
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text className="font-bebas text-cream text-xl mb-0.5">
        {ticket.event?.name ?? 'Unknown Event'}
      </Text>
      <Text className="font-sans text-muted text-sm mb-2">
        {ticket.event?.venue?.name ?? ''} · {ticket.event?.venue?.city ?? ''}
      </Text>
      <View className="flex-row justify-between items-center">
        <Text className="font-sans text-gold text-sm">
          {ticket.event?.event_date
            ? new Date(ticket.event.event_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : ''}
        </Text>
        <View className="bg-ember rounded-full px-3 py-0.5">
          <Text className="font-bebas text-cream text-xs tracking-wider">
            {ticket.event?.category?.toUpperCase() ?? 'EVENT'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
