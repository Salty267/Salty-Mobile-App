import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomPad } from '@/lib/useBottomPad';
import { scale } from '@/lib/layout';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useFriends } from '@/lib/useFriends';
import type { AcceptedFriend, PendingRequest } from '@/lib/useFriends';
import { useUserSearch } from '@/lib/useUserSearch';
import type { SearchResult } from '@/lib/useUserSearch';
import { useContactMatches } from '@/lib/useContactMatches';

const BRAND_FROM = '#4f6cf2';
const BRAND_TO   = '#a25cf2';
const FG         = '#1a1530';
const MUTED      = '#6b6a85';
const SURFACE    = '#ffffff';
const SECONDARY  = '#f1eefb';
const BG         = '#eef0fb';

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function FriendsScreen(): React.JSX.Element {
  const bottomPad = useBottomPad();
  const router = useRouter();
  const [searchVisible, setSearchVisible] = useState(false);

  const {
    friends, pendingRequests, sentRequests,
    loading, error, refresh,
    sendRequest, acceptRequest, declineRequest, withdrawRequest,
  } = useFriends();

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const { query, setQuery, results, loading: searching, optimisticSend } = useUserSearch(
    friends, sentRequests, pendingRequests,
  );

  const {
    results: contactResults, loading: contactLoading,
    error: contactError, permissionDenied,
    load: loadContacts, optimisticSend: contactOptimisticSend,
  } = useContactMatches(friends, sentRequests, pendingRequests);

  const handleSend = async (addresseeId: string) => {
    optimisticSend(addresseeId);
    try { await sendRequest(addresseeId); } catch {}
  };

  const handleSendFromContacts = async (addresseeId: string) => {
    contactOptimisticSend(addresseeId);
    try { await sendRequest(addresseeId); } catch {}
  };

  const handleWithdraw = async (friendshipId: string, addresseeId: string) => {
    try { await withdrawRequest(friendshipId, addresseeId); } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[BRAND_FROM, BRAND_TO]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
              style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 28, letterSpacing: 6, color: '#fff' }}>FRIENDS</Text>
            <TouchableOpacity
              onPress={() => setSearchVisible(true)}
              style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ── Body ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={BRAND_FROM} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="alert-circle-outline" size={48} color={MUTED} />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginTop: 16, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 8, textAlign: 'center' }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={refresh}
            style={{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: BRAND_FROM, borderRadius: 99 }}
          >
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#fff' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>

          {/* ── Pending Requests ── */}
          {pendingRequests.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2 }}>
                  Friend Requests
                </Text>
                <View style={{ backgroundColor: BRAND_FROM, borderRadius: 99, minWidth: 22, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: '#fff' }}>{pendingRequests.length}</Text>
                </View>
              </View>
              <View style={{ gap: 10 }}>
                {pendingRequests.map(req => (
                  <PendingRequestCard
                    key={req.friendship_id}
                    request={req}
                    onAccept={() => acceptRequest(req.friendship_id).catch(() => {})}
                    onDecline={() => declineRequest(req.friendship_id).catch(() => {})}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── Activity placeholder ── */}
          {friends.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginBottom: 14, letterSpacing: -0.2 }}>
                Recent Activity
              </Text>
              <View style={{ backgroundColor: SURFACE, borderRadius: 16, padding: 16, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2, alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles-outline" size={24} color={MUTED} />
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, textAlign: 'center' }}>
                  Activity from your friends will appear here.
                </Text>
              </View>
            </View>
          )}

          {/* ── Friends list ── */}
          <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, letterSpacing: -0.2 }}>
                Your Friends
              </Text>
              <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 12, color: MUTED }}>
                {friends.length} {friends.length === 1 ? 'friend' : 'friends'}
              </Text>
            </View>

            {friends.length === 0 ? (
              <EmptyFriends onAddPress={() => setSearchVisible(true)} />
            ) : (
              <View style={{ gap: 12 }}>
                {friends.map(friend => (
                  <FriendCard key={friend.friendship_id} friend={friend} />
                ))}
              </View>
            )}
          </View>

        </ScrollView>
      )}

      {/* ── Search Modal ── */}
      <SearchModal
        visible={searchVisible}
        onClose={() => { setSearchVisible(false); setQuery(''); }}
        query={query}
        onQueryChange={setQuery}
        results={results}
        searching={searching}
        onSend={handleSend}
        onWithdraw={handleWithdraw}
        contactResults={contactResults}
        contactLoading={contactLoading}
        contactError={contactError}
        permissionDenied={permissionDenied}
        onLoadContacts={loadContacts}
        onSendContact={handleSendFromContacts}
      />
    </View>
  );
}

// ── Pending Request Card ──────────────────────────────────────────────────────

function PendingRequestCard({
  request, onAccept, onDecline,
}: { request: PendingRequest; onAccept: () => void; onDecline: () => void }): React.JSX.Element {
  const name = request.requester.display_name;
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 16, padding: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }}>
      <AvatarOrInitials uri={request.requester.avatar_url} initials={initials} size={46} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }} numberOfLines={1}>
          {name ?? 'Someone'}
        </Text>
        {request.requester.username ? (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
            @{request.requester.username}
          </Text>
        ) : (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 2 }}>
            Wants to be friends
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onDecline}
        style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: '#fdecea', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}
      >
        <Ionicons name="close" size={18} color="#e55" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onAccept}
        style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="checkmark" size={18} color="#059669" />
      </TouchableOpacity>
    </View>
  );
}

// ── Friend Card ───────────────────────────────────────────────────────────────

function FriendCard({ friend }: { friend: AcceptedFriend }): React.JSX.Element {
  const router = useRouter();
  const name = friend.display_name;
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: SURFACE, borderRadius: 18, padding: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 3 }}>
      <AvatarOrInitials uri={friend.avatar_url} initials={initials} size={52} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 15, color: FG }} numberOfLines={1}>
          {name ?? 'Friend'}
        </Text>
        {friend.username ? (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
            @{friend.username}
          </Text>
        ) : (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 12, color: MUTED, marginTop: 2 }}>
            {friend.mutual_events > 0
              ? `${friend.mutual_events} mutual event${friend.mutual_events === 1 ? '' : 's'}`
              : 'Connected via Salty'}
          </Text>
        )}
        {friend.username && friend.mutual_events > 0 && (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED }}>
            {`${friend.mutual_events} mutual event${friend.mutual_events === 1 ? '' : 's'}`}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => router.push({
          pathname: '/user-profile',
          params: {
            userId: friend.id,
            friendshipId: friend.friendship_id,
            mutualEvents: String(friend.mutual_events),
          },
        })}
        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: SECONDARY }}
      >
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: FG }}>View</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyFriends({ onAddPress }: { onAddPress: () => void }): React.JSX.Element {
  return (
    <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 16 }}>
      <Ionicons name="people-outline" size={52} color={MUTED} />
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 17, color: FG, marginTop: 18 }}>No friends yet</Text>
      <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 }}>
        Search for people to add as friends and share events together.
      </Text>
      <TouchableOpacity onPress={onAddPress} activeOpacity={0.85} style={{ marginTop: 20, overflow: 'hidden', borderRadius: 99 }}>
        <LinearGradient
          colors={[BRAND_FROM, BRAND_TO]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12 }}
        >
          <Ionicons name="person-add-outline" size={16} color="#fff" />
          <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' }}>Find Friends</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ── Search Modal ──────────────────────────────────────────────────────────────

function SearchModal({
  visible, onClose, query, onQueryChange, results, searching, onSend, onWithdraw,
  contactResults, contactLoading, contactError, permissionDenied, onLoadContacts, onSendContact,
}: {
  visible: boolean; onClose: () => void;
  query: string; onQueryChange: (q: string) => void;
  results: SearchResult[]; searching: boolean;
  onSend: (id: string) => void; onWithdraw: (fid: string, addresseeId: string) => void;
  contactResults: SearchResult[]; contactLoading: boolean;
  contactError: string | null; permissionDenied: boolean;
  onLoadContacts: () => void; onSendContact: (id: string) => void;
}): React.JSX.Element {
  const showContacts = query.trim().length < 2;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: BG }}>
        <LinearGradient
          colors={[BRAND_FROM, BRAND_TO]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}
        >
          <SafeAreaView edges={['top']}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
              <Text style={{ fontFamily: 'BebasNeue_400Regular', fontSize: 28, letterSpacing: 6, color: '#fff' }}>ADD FRIENDS</Text>
              <TouchableOpacity
                onPress={onClose}
                style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={{ marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, height: scale(48), paddingHorizontal: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.96)' }}>
              <Ionicons name="search-outline" size={16} color={MUTED} />
              <TextInput
                value={query}
                onChangeText={onQueryChange}
                placeholder="Search by @username or name…"
                placeholderTextColor={MUTED}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 15, color: FG }}
              />
              {searching && <ActivityIndicator size="small" color={BRAND_FROM} />}
              {query.length > 0 && !searching && (
                <TouchableOpacity onPress={() => onQueryChange('')}>
                  <Ionicons name="close-circle" size={18} color={MUTED} />
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 10 }}
        >
          {/* ── Contacts section (shown when search bar is empty) ── */}
          {showContacts && (
            <>
              <TouchableOpacity
                onPress={onLoadContacts}
                disabled={contactLoading}
                activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: SURFACE, borderRadius: 16, paddingVertical: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }}
              >
                {contactLoading
                  ? <ActivityIndicator size="small" color={BRAND_FROM} />
                  : <Ionicons name="people-outline" size={20} color={BRAND_FROM} />
                }
                <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: BRAND_FROM }}>
                  {contactLoading ? 'Scanning contacts…' : 'Find from Contacts'}
                </Text>
              </TouchableOpacity>

              {permissionDenied && (
                <View style={{ alignItems: 'center', paddingVertical: 12, gap: 4 }}>
                  <Ionicons name="lock-closed-outline" size={24} color={MUTED} />
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, textAlign: 'center' }}>
                    Contacts access was denied. Enable it in your phone settings to find friends.
                  </Text>
                </View>
              )}

              {contactError && !permissionDenied && (
                <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: '#e55', textAlign: 'center' }}>
                  {contactError}
                </Text>
              )}

              {!contactLoading && !permissionDenied && contactResults.length > 0 && (
                <>
                  <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 13, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 4 }}>
                    People you know
                  </Text>
                  {contactResults.map(result => (
                    <SearchResultRow
                      key={result.id}
                      result={result}
                      onSend={() => onSendContact(result.id)}
                      onWithdraw={() => {}}
                    />
                  ))}
                </>
              )}

              {!contactLoading && !permissionDenied && contactResults.length === 0 && contactError === null && (
                <View style={{ alignItems: 'center', paddingTop: 32 }}>
                  <Ionicons name="search-outline" size={48} color={MUTED} />
                  <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 14, color: MUTED, marginTop: 12, textAlign: 'center' }}>
                    Search by @username or display name
                  </Text>
                </View>
              )}
            </>
          )}

          {/* ── Username/name search results ── */}
          {!showContacts && query.trim().length >= 2 && !searching && results.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <Ionicons name="person-outline" size={48} color={MUTED} />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: FG, marginTop: 12 }}>No users found</Text>
              <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 13, color: MUTED, marginTop: 6 }}>Try a different username or name.</Text>
            </View>
          )}
          {!showContacts && results.map(result => (
            <SearchResultRow
              key={result.id}
              result={result}
              onSend={() => onSend(result.id)}
              onWithdraw={() => result.friendship_id && onWithdraw(result.friendship_id, result.id)}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SearchResultRow({
  result, onSend, onWithdraw,
}: { result: SearchResult; onSend: () => void; onWithdraw: () => void }): React.JSX.Element {
  const router = useRouter();
  const name = result.display_name;
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const ActionButton = (): React.JSX.Element => {
    switch (result.status) {
      case 'friends':
        return (
          <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#d1fae5' }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#059669' }}>Friends</Text>
          </View>
        );
      case 'pending_sent':
        return (
          <TouchableOpacity onPress={onWithdraw} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: SECONDARY }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: MUTED }}>Pending</Text>
          </TouchableOpacity>
        );
      case 'pending_received':
        return (
          <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: `${BRAND_FROM}22` }}>
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: BRAND_FROM }}>Requested you</Text>
          </View>
        );
      default:
        return (
          <TouchableOpacity onPress={onSend} activeOpacity={0.85} style={{ overflow: 'hidden', borderRadius: 999 }}>
            <LinearGradient
              colors={[BRAND_FROM, BRAND_TO]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8 }}
            >
              <Ionicons name="person-add-outline" size={13} color="#fff" />
              <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 12, color: '#fff' }}>Add</Text>
            </LinearGradient>
          </TouchableOpacity>
        );
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderRadius: 16, padding: 14, shadowColor: '#503cb4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }}>
      <AvatarOrInitials uri={result.avatar_url} initials={initials} size={46} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 14, color: FG }} numberOfLines={1}>
          {name ?? 'Unknown User'}
        </Text>
        {result.username && (
          <Text style={{ fontFamily: 'DMSans_400Regular', fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
            @{result.username}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/user-profile', params: { userId: result.id } })}
          style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: SECONDARY, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="person-outline" size={16} color={BRAND_FROM} />
        </TouchableOpacity>
        <ActionButton />
      </View>
    </View>
  );
}

// ── Avatar utility ────────────────────────────────────────────────────────────

function AvatarOrInitials({ uri, initials, size }: { uri: string | null; initials: string; size: number }): React.JSX.Element {
  return (
    <View style={{ width: scale(size), height: scale(size), borderRadius: scale(size / 2), backgroundColor: SECONDARY, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri
        ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: scale(size * 0.35), color: BRAND_FROM }}>{initials}</Text>
      }
    </View>
  );
}
