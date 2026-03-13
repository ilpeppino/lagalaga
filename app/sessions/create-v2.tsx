/**
 * CreateSessionScreen (v2 — simplified)
 *
 * Minimal session creation:
 *  1. Pick a game (from Roblox favorites or paste a link)
 *  2. Set visibility
 *  3. CREATE SESSION → navigate to SessionLobbyScreen
 *
 * Title is auto-generated as "{displayName}'s {gameName} session".
 * Friends, advanced options, and scheduling moved to the lobby screen.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionVisibility } from '@/src/features/sessions/types-v2';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AnimatedButton as Button, TextInput } from '@/components/ui/paper';
import { Menu, SegmentedButtons } from 'react-native-paper';
import { useAuth } from '@/src/features/auth/useAuth';
import type { Favorite } from '@/src/features/favorites/cache';
import { warmFavorites } from '@/src/features/favorites/service';
import { useFavorites } from '@/src/features/favorites/useFavorites';
import { buildCreateSessionPayload } from '@/src/features/sessions/friendSelection';

const VISIBILITY_OPTIONS: { value: SessionVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends Only' },
  { value: 'invite_only', label: 'Invite Only' },
];

function getFavoriteDisplayName(favorite: Favorite): string {
  return favorite.name?.trim() || 'Unnamed Experience';
}

export default function CreateSessionScreenV2() {
  const router = useRouter();
  const { getErrorMessage } = useErrorHandler();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const {
    favorites,
    loading: isLoadingFavorites,
    error: favoritesError,
    refresh: refreshFavorites,
    forceRefresh: forceRefreshFavorites,
  } = useFavorites(user?.id);

  // Game selection state
  const [robloxUrl, setRobloxUrl] = useState('');
  const [selectedFavorite, setSelectedFavorite] = useState<Favorite | null>(null);
  const [gameInputMode, setGameInputMode] = useState<'favorites' | 'link'>('favorites');
  const [favoritesMenuVisible, setFavoritesMenuVisible] = useState(false);

  // Form state
  const [visibility, setVisibility] = useState<SessionVisibility>('friends');

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) void warmFavorites(user.id);
  }, [user?.id]);

  // Auto-generated title
  const autoTitle = useMemo(() => {
    const name = user?.robloxDisplayName || user?.robloxUsername || 'Your';
    const gameName = selectedFavorite
      ? getFavoriteDisplayName(selectedFavorite)
      : 'Roblox';
    return `${name}'s ${gameName} session`;
  }, [user, selectedFavorite]);

  const handleSelectFavorite = (favorite: Favorite) => {
    setFavoritesMenuVisible(false);
    setSelectedFavorite(favorite);
    setRobloxUrl(favorite.url ?? '');
  };

  const handleCreate = async () => {
    setError(null);

    if (!robloxUrl.trim()) {
      setError('Please select or enter a Roblox game link');
      return;
    }

    try {
      setIsCreating(true);

      const result = await sessionsAPIStoreV2.createSession(
        buildCreateSessionPayload({
          robloxUrl: robloxUrl.trim(),
          title: autoTitle,
          visibility,
          isRanked: false,
          selectedFriendIds: [],
        })
      );

      router.replace({
        pathname: '/sessions/lobby',
        params: {
          id: result.session.id,
          inviteLink: result.inviteLink,
        },
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create session'));
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = !isCreating && Boolean(robloxUrl.trim());

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Intro */}
        <ThemedText type="bodyMedium" lightColor="#8E8E93" darkColor="#636366" style={styles.intro}>
          Start a new Roblox session. Invite friends after creating.
        </ThemedText>

        {/* GAME */}
        <View style={styles.section}>
          <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" style={styles.sectionLabel}>
            GAME
          </ThemedText>

          {gameInputMode === 'favorites' ? (
            <View style={[styles.gameCard, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
              <Menu
                visible={favoritesMenuVisible}
                onDismiss={() => setFavoritesMenuVisible(false)}
                anchor={
                  <TouchableOpacity
                    style={styles.gameCardInner}
                    onPress={() => setFavoritesMenuVisible(true)}
                    activeOpacity={0.7}
                  >
                    {selectedFavorite?.thumbnailUrl ? (
                      <Image
                        source={{ uri: selectedFavorite.thumbnailUrl }}
                        style={styles.gameThumbnail}
                      />
                    ) : (
                      <View style={[styles.gameThumbnail, styles.gameThumbnailPlaceholder]}>
                        <MaterialIcons name="gamepad" size={26} color={isDark ? '#555' : '#bbb'} />
                      </View>
                    )}

                    <View style={styles.gameCardText}>
                      <ThemedText type="titleMedium" numberOfLines={2} style={styles.gameNameText}>
                        {selectedFavorite
                          ? getFavoriteDisplayName(selectedFavorite)
                          : 'Select from your Roblox favorites'}
                      </ThemedText>
                      {isLoadingFavorites && (
                        <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
                          Loading...
                        </ThemedText>
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={() => void forceRefreshFavorites()}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      activeOpacity={0.6}
                    >
                      <MaterialIcons
                        name="refresh"
                        size={20}
                        color={isDark ? '#636366' : '#8E8E93'}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                }
              >
                {favorites.map((fav) => (
                  <Menu.Item
                    key={fav.id}
                    title={getFavoriteDisplayName(fav)}
                    onPress={() => handleSelectFavorite(fav)}
                  />
                ))}
                {favorites.length === 0 && isLoadingFavorites && (
                  <Menu.Item title="Loading..." onPress={() => setFavoritesMenuVisible(false)} />
                )}
                {favorites.length === 0 && favoritesError && (
                  <Menu.Item
                    title="Couldn't load favorites — tap to retry"
                    onPress={() => {
                      void refreshFavorites();
                      setFavoritesMenuVisible(false);
                    }}
                  />
                )}
                {favorites.length === 0 && !isLoadingFavorites && !favoritesError && (
                  <Menu.Item title="No favorites found" onPress={() => setFavoritesMenuVisible(false)} />
                )}
              </Menu>
            </View>
          ) : (
            <TextInput
              style={styles.urlInput}
              value={robloxUrl}
              onChangeText={setRobloxUrl}
              placeholder="https://www.roblox.com/games/..."
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
              variant="outlined"
            />
          )}

          <Button
            title={gameInputMode === 'favorites' ? 'Paste a link instead' : 'Back to favorites'}
            variant="text"
            textColor="#007AFF"
            style={styles.modeSwitchBtn}
            onPress={() =>
              setGameInputMode((m) => {
                if (m === 'favorites') {
                  setSelectedFavorite(null);
                  return 'link';
                }
                return 'favorites';
              })
            }
          />
        </View>

        {/* VISIBILITY */}
        <View style={styles.section}>
          <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" style={styles.sectionLabel}>
            VISIBILITY
          </ThemedText>
          <SegmentedButtons
            value={visibility}
            onValueChange={(v) => setVisibility(v as SessionVisibility)}
            buttons={VISIBILITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </View>

        {/* Auto-title preview */}
        <View style={[styles.titlePreview, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
          <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
            Session will be named:
          </ThemedText>
          <ThemedText type="bodyMedium" style={styles.titlePreviewText}>
            {autoTitle}
          </ThemedText>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <ThemedText type="bodyMedium" lightColor="#c62828" darkColor="#ff5252">
              {error}
            </ThemedText>
          </View>
        )}

        {/* CTA */}
        <Button
          title={isCreating ? 'Creating...' : 'CREATE SESSION'}
          variant="filled"
          buttonColor="#007AFF"
          enableHaptics
          style={[styles.ctaBtn, !canCreate && styles.ctaBtnDisabled]}
          contentStyle={styles.ctaBtnContent}
          labelStyle={styles.ctaBtnLabel}
          onPress={handleCreate}
          loading={isCreating}
          disabled={!canCreate}
        />

        <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366" style={styles.ctaHint}>
          You can rename the session and invite friends in the next step.
        </ThemedText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 56,
  },
  intro: {
    marginBottom: 24,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  gameCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  gameCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  gameThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  gameThumbnailPlaceholder: {
    backgroundColor: '#d1d1d6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameCardText: {
    flex: 1,
    gap: 4,
  },
  gameNameText: {
    fontSize: 15,
    fontWeight: '600',
  },
  urlInput: {
    borderRadius: 10,
  },
  modeSwitchBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  titlePreview: {
    borderRadius: 12,
    padding: 14,
    gap: 4,
    marginBottom: 24,
  },
  titlePreviewText: {
    fontWeight: '500',
  },
  errorBox: {
    backgroundColor: '#ffebee',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  ctaBtn: {
    borderRadius: 14,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaBtnContent: {
    minHeight: 60,
  },
  ctaBtnLabel: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  ctaHint: {
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
});
