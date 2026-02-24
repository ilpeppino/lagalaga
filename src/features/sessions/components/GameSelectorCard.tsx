import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { TextInput } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Favorite } from '@/src/features/favorites/cache';
import { createSessionPalette, spacing } from './createSessionTokens';

interface GameSelectorCardProps {
  favorites: Favorite[];
  selectedFavorite: Favorite | null;
  robloxUrl: string;
  favoritesError?: string | null;
  isLoadingFavorites: boolean;
  isCreating: boolean;
  onSelectFavorite: (favorite: Favorite) => void;
  onSetRobloxUrl: (url: string) => void;
  onForceRefreshFavorites: () => void;
  onRetryFavorites: () => void;
}

function getFavoriteDisplayName(favorite: Favorite): string {
  const name = favorite.name?.trim();
  if (name) {
    return name;
  }

  return 'Unnamed Experience';
}

export function GameSelectorCard({
  favorites,
  selectedFavorite,
  robloxUrl,
  favoritesError,
  isLoadingFavorites,
  isCreating,
  onSelectFavorite,
  onSetRobloxUrl,
  onForceRefreshFavorites,
  onRetryFavorites,
}: GameSelectorCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = isDark ? createSessionPalette.dark : createSessionPalette.light;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [mode, setMode] = useState<'favorites' | 'link'>('favorites');
  const [favoriteSearch, setFavoriteSearch] = useState('');

  const hasSelectedGame = robloxUrl.trim().length > 0;
  const cardScale = useSharedValue(1);

  useEffect(() => {
    if (!hasSelectedGame) {
      cardScale.value = 1;
      return;
    }

    cardScale.value = 0.96;
    cardScale.value = withTiming(1, { duration: 150 });
  }, [cardScale, hasSelectedGame]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const filteredFavorites = useMemo(() => {
    const query = favoriteSearch.trim().toLowerCase();
    if (!query) {
      return favorites;
    }

    return favorites.filter((favorite) => {
      const name = getFavoriteDisplayName(favorite).toLowerCase();
      return name.includes(query);
    });
  }, [favoriteSearch, favorites]);

  const selectedName = selectedFavorite ? getFavoriteDisplayName(selectedFavorite) : '';

  return (
    <View>
      <ThemedText type="titleSmall" lightColor={palette.textTertiary} darkColor={palette.textTertiary} style={styles.sectionLabel}>
        Game
      </ThemedText>
      <Animated.View style={cardAnimatedStyle}>
        <Pressable
          style={({ pressed }) => [
            styles.selectorCard,
            {
              backgroundColor: pressed ? palette.surfacePressed : palette.surface,
              borderColor: palette.borderTint,
              shadowColor: isDark ? '#000' : '#21314f',
            },
          ]}
          onPress={() => setIsModalVisible(true)}
          disabled={isCreating}
        >
          <View style={styles.selectorContent}>
            {selectedFavorite?.thumbnailUrl ? (
              <Image source={{ uri: selectedFavorite.thumbnailUrl }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnailFallback, { backgroundColor: palette.accentSoft }]}>
                <MaterialIcons name="sports-esports" size={18} color={palette.accent} />
              </View>
            )}
            <View style={styles.selectorTextWrap}>
              <ThemedText type="bodyLarge" lightColor={palette.textPrimary} darkColor={palette.textPrimary} numberOfLines={1}>
                {selectedName || 'Select Game'}
              </ThemedText>
              <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary} numberOfLines={1}>
                {selectedFavorite ? 'Roblox favorite' : hasSelectedGame ? 'Pasted Roblox link' : 'Pick from favorites or paste link'}
              </ThemedText>
            </View>
            <MaterialIcons name="expand-more" size={22} color={palette.textSecondary} />
          </View>
        </Pressable>
      </Animated.View>

      {!!favoritesError && (
        <ThemedText type="bodySmall" lightColor={createSessionPalette.light.dangerText} darkColor={createSessionPalette.dark.dangerText} style={styles.inlineError}>
          {favoritesError}
        </ThemedText>
      )}

      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={[styles.modalScrim, { backgroundColor: 'rgba(0,0,0,0.62)' }]}>
          <View style={[styles.modalBody, { backgroundColor: palette.surfaceRaised }]}> 
            <View style={styles.modalHeader}>
              <ThemedText type="titleMedium" lightColor={palette.textPrimary} darkColor={palette.textPrimary}>
                Select game
              </ThemedText>
              <Pressable
                style={styles.iconButton}
                onPress={onForceRefreshFavorites}
                disabled={isCreating || isLoadingFavorites}
              >
                <MaterialIcons
                  name={isLoadingFavorites ? 'autorenew' : 'refresh'}
                  size={18}
                  color={palette.accent}
                />
              </Pressable>
            </View>

            <View style={[styles.modeRow, { borderColor: palette.borderTint }]}> 
              <Pressable
                style={[styles.modeButton, mode === 'favorites' && { backgroundColor: palette.surface }]}
                onPress={() => setMode('favorites')}
              >
                <ThemedText type="labelLarge" lightColor={palette.textPrimary} darkColor={palette.textPrimary}>
                  Favorites
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modeButton, mode === 'link' && { backgroundColor: palette.surface }]}
                onPress={() => setMode('link')}
              >
                <ThemedText type="labelLarge" lightColor={palette.textPrimary} darkColor={palette.textPrimary}>
                  Paste Link
                </ThemedText>
              </Pressable>
            </View>

            {mode === 'favorites' ? (
              <>
                <TextInput
                  value={favoriteSearch}
                  onChangeText={setFavoriteSearch}
                  placeholder="Search favorites"
                  placeholderTextColor={palette.placeholder}
                  style={styles.searchInput}
                />
                <ScrollView contentContainerStyle={styles.favoriteList} keyboardShouldPersistTaps="handled">
                  {filteredFavorites.map((favorite) => {
                    const favoriteName = getFavoriteDisplayName(favorite);
                    return (
                      <Pressable
                        key={favorite.id}
                        style={[styles.favoriteItem, { backgroundColor: palette.surface }]}
                        onPress={() => {
                          onSelectFavorite(favorite);
                          setIsModalVisible(false);
                        }}
                      >
                        <ThemedText type="bodyLarge" lightColor={palette.textPrimary} darkColor={palette.textPrimary}>
                          {favoriteName}
                        </ThemedText>
                      </Pressable>
                    );
                  })}

                  {filteredFavorites.length === 0 && !isLoadingFavorites && !favoritesError && (
                    <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary}>
                      No favorites found.
                    </ThemedText>
                  )}

                  {!!favoritesError && (
                    <Pressable onPress={onRetryFavorites}>
                      <ThemedText type="bodySmall" lightColor={palette.accent} darkColor={palette.accent}>
                        {"Couldn't load favorites. Tap to retry."}
                      </ThemedText>
                    </Pressable>
                  )}
                </ScrollView>
              </>
            ) : (
              <View style={styles.linkModeBody}>
                <TextInput
                  value={robloxUrl}
                  onChangeText={onSetRobloxUrl}
                  placeholder="https://www.roblox.com/games/..."
                  placeholderTextColor={palette.placeholder}
                  autoCapitalize="none"
                  keyboardType="url"
                  autoCorrect={false}
                />
                <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary}>
                  Paste any Roblox game URL.
                </ThemedText>
              </View>
            )}

            <Pressable
              style={[styles.closeButton, { backgroundColor: palette.accentSoft }]}
              onPress={() => setIsModalVisible(false)}
            >
              <ThemedText type="labelLarge" lightColor={palette.accent} darkColor={palette.accent}>
                Done
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: spacing.sm,
    fontSize: 14,
    fontWeight: '500',
  },
  selectorCard: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 78,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  thumbnailFallback: {
    width: 50,
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  inlineError: {
    marginTop: spacing.sm,
  },
  modalScrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBody: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.md,
    maxHeight: '80%',
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  modeButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    borderRadius: 10,
  },
  favoriteList: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  favoriteItem: {
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkModeBody: {
    gap: spacing.sm,
  },
  closeButton: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
