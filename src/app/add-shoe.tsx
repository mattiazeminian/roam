import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { FormSheet } from '@/components/form-sheet';
import { MapControl } from '@/components/map-control';
import { Text } from '@/components/text';
import { selectionFeedback } from '@/lib/haptics';
import { SHOE_BRANDS, catalogBrandKey, type ShoeBrand } from '@/services/shoe-catalog';
import {
  SHOE_TYPES,
  addShoe,
  createShoe,
  loadShoes,
  saveShoes,
  type ShoeType,
} from '@/services/shoes';
import { layout, radii, spacing, useAppearance, useTheme } from '@/theme';

const MAX_RESULTS = 40;

/**
 * Add a shoe (#148).
 *
 * Choose a brand, then a model — with search across both. The catalog is only a
 * shortcut to a name; the shoe is stored with its own brand and model, so it
 * never depends on the catalog continuing to hold that entry. A runner whose
 * shoe is not listed adds it by hand.
 */
export default function AddShoeScreen() {
  const theme = useTheme();
  const scheme = useAppearance();
  const insets = useSafeAreaInsets();

  const [brand, setBrand] = useState<ShoeBrand | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ShoeType>('road');
  const [manual, setManual] = useState(false);

  const persist = useCallback(async (input: { brand: string; model: string; brandKey?: string | null }) => {
    const shoes = await loadShoes().catch(() => []);
    await saveShoes(
      addShoe(
        shoes,
        createShoe({
          brand: input.brand,
          model: input.model,
          brandKey: input.brandKey ?? catalogBrandKey(input.brand),
          type,
        }),
      ),
    ).catch(() => {});
  }, [type]);

  const addModel = useCallback(
    async (selectedBrand: ShoeBrand, model: string) => {
      selectionFeedback();
      await persist({ brand: selectedBrand.name, model, brandKey: selectedBrand.key });
      router.back();
    },
    [persist],
  );

  const q = query.trim().toLocaleLowerCase();
  const results = useMemo(() => {
    if (!q) {
      return [];
    }
    const matches: { brand: ShoeBrand; model: string }[] = [];
    for (const entry of SHOE_BRANDS) {
      const brandMatches = entry.name.toLocaleLowerCase().includes(q);
      for (const model of entry.models) {
        if (
          brandMatches ||
          model.toLocaleLowerCase().includes(q) ||
          `${entry.name} ${model}`.toLocaleLowerCase().includes(q)
        ) {
          matches.push({ brand: entry, model });
        }
      }
    }
    return matches.slice(0, MAX_RESULTS);
  }, [q]);

  const searching = q.length > 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.header}>
        <MapControl symbol="xmark" accessibilityLabel="Close" onPress={() => router.back()} />
        {brand && !searching ? (
          <Pressable onPress={() => { selectionFeedback(); setBrand(null); }} accessibilityRole="button">
            <Text variant="label" color="accentText">Change brand</Text>
          </Pressable>
        ) : null}
      </View>

      <Text variant="large" style={styles.title}>Add a shoe</Text>

      <View style={[styles.search, { backgroundColor: theme.fill }]}>
        <SymbolView name="magnifyingglass" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={brand && !searching ? `Search ${brand.name}` : 'Search brand or model'}
          placeholderTextColor={theme.textSecondary}
          keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search shoes"
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>

      {brand && !searching ? (
        <View style={styles.brandHeader}>
          <BrandMark brand={brand} size={32} />
          <Text variant="title">{brand.name}</Text>
        </View>
      ) : null}

      {brand && !searching ? (
        <View style={styles.types}>
          {SHOE_TYPES.map((option) => {
            const selected = type === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => { selectionFeedback(); setType(option.key); }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                style={[
                  styles.typeChip,
                  { backgroundColor: selected ? theme.accent : theme.fill },
                ]}>
                <Text variant="caption" color={selected ? 'accentForeground' : 'text'}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled">
        {searching
          ? results.length > 0
            ? results.map((entry) => (
                <ModelRow
                  key={`${entry.brand.key}-${entry.model}`}
                  brand={entry.brand}
                  model={entry.model}
                  onPress={() => void addModel(entry.brand, entry.model)}
                />
              ))
            : (
              <Text variant="body" color="textSecondary" style={styles.empty}>
                No match in the catalog. Add it by hand so it still counts.
              </Text>
            )
          : brand
            ? brand.models.map((model) => (
                <ModelRow
                  key={model}
                  brand={brand}
                  model={model}
                  onPress={() => void addModel(brand, model)}
                />
              ))
            : SHOE_BRANDS.map((entry) => (
                <Pressable
                  key={entry.key}
                  onPress={() => { selectionFeedback(); setBrand(entry); setQuery(''); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.name}, ${entry.models.length} models`}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: theme.borderSubtle },
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.mark}>
                    <BrandMark brand={entry} size={34} />
                  </View>
                  <View style={styles.rowText}>
                    <Text variant="body">{entry.name}</Text>
                    <Text variant="caption" color="textSecondary">
                      {`${entry.models.length} models`}
                    </Text>
                  </View>
                  <SymbolView name="chevron.right" size={layout.iconSizeSmall} tintColor={theme.textSecondary} />
                </Pressable>
              ))}

        <Pressable
          onPress={() => { selectionFeedback(); setManual(true); }}
          accessibilityRole="button"
          accessibilityLabel="Add my shoes manually"
          style={({ pressed }) => [styles.manualRow, pressed && styles.pressed]}>
          <Text variant="body" color="accentText">{"Can't find your shoes? Add manually"}</Text>
        </Pressable>
      </ScrollView>

      {manual ? (
        <FormSheet
          title="Add a shoe"
          message="Any brand and model — a custom shoe works exactly like a catalog one."
          fields={[
            { key: 'brand', label: 'Brand', placeholder: 'e.g. HOKA', autoFocus: true },
            { key: 'model', label: 'Model', placeholder: 'e.g. Clifton 10' },
          ]}
          submitLabel="Add"
          onSubmit={(values) => {
            void persist({ brand: values.brand, model: values.model }).then(() => router.back());
          }}
          onClose={() => setManual(false)}
        />
      ) : null}
    </View>
  );
}

function ModelRow({
  brand,
  model,
  onPress,
}: {
  brand: ShoeBrand;
  model: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add ${brand.name} ${model}`}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.borderSubtle },
        pressed && styles.pressed,
      ]}>
      <View style={styles.mark}>
        <BrandMark brand={brand} size={30} />
      </View>
      <View style={styles.rowText}>
        <Text variant="body">{model}</Text>
        <Text variant="caption" color="textSecondary">{brand.name}</Text>
      </View>
      <SymbolView name="plus.circle" size={layout.iconSize} tintColor={theme.accentText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenMargin,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouchTarget,
  },
  title: {
    marginTop: spacing.xs,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.small,
    borderCurve: 'continuous',
    marginTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: spacing.xs,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  types: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  typeChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
  },
  list: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mark: {
    width: 34,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  manualRow: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  empty: {
    marginTop: spacing.lg,
  },
  pressed: {
    opacity: 0.6,
  },
});
