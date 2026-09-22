/**
 * Running shoes (#112).
 *
 * Deliberately small: a shoe is something the runner owns, and its one useful
 * fact is how far it has been run in. Mileage is derived from runs attributed
 * to it — never estimated, and no wear or lifespan prediction is offered,
 * because Roam has no basis for one.
 */

import { Directory, File, Paths } from 'expo-file-system';

const SHOES_FILE = 'shoes.json';

export type Shoe = {
  id: string;
  brand: string;
  model: string;
  /** Road, trail, race, or gym use; legacy shoes default to road. */
  type: ShoeType;
  /** Stable catalog key when the shoe came from the bundled catalog. */
  brandKey: string | null;
  /** Whether this is the runner's preselected pair. */
  isDefault: boolean;
  /** An optional pet name, e.g. "the blue ones". */
  nickname: string | null;
  /** Epoch milliseconds. */
  addedAt: number;
  /** A retired shoe keeps its history but is not offered for new runs. */
  retired: boolean;
};

export type ShoeType = 'road' | 'trail' | 'race' | 'gym' | 'other';

export const SHOE_TYPES: { key: ShoeType; label: string }[] = [
  { key: 'road', label: 'Road' },
  { key: 'trail', label: 'Trail' },
  { key: 'race', label: 'Race day' },
  { key: 'gym', label: 'Gym' },
  { key: 'other', label: 'Other' },
];

export const SHOE_CATALOG = [
  { key: 'nike', name: 'Nike', models: ['Pegasus 41', 'Vomero 18', 'Structure 25', 'Alphafly 3'] },
  { key: 'adidas', name: 'adidas', models: ['Supernova Rise', 'Adizero Boston 13', 'Adizero Adios Pro 4'] },
  { key: 'asics', name: 'ASICS', models: ['Gel-Nimbus 27', 'Novablast 5', 'Gel-Kayano 31', 'Metaspeed Sky Paris'] },
  { key: 'new-balance', name: 'New Balance', models: ['1080v14', 'FuelCell Rebel v5', 'Fresh Foam X 860v14'] },
  { key: 'hoka', name: 'HOKA', models: ['Clifton 10', 'Bondi 9', 'Mach 6', 'Speedgoat 6'] },
  { key: 'brooks', name: 'Brooks', models: ['Ghost 17', 'Glycerin 22', 'Adrenaline GTS 24'] },
  { key: 'saucony', name: 'Saucony', models: ['Ride 18', 'Endorphin Speed 4', 'Triumph 22'] },
  { key: 'on', name: 'On', models: ['Cloudsurfer 2', 'Cloudmonster 2', 'Cloudboom Strike'] },
  { key: 'mizuno', name: 'Mizuno', models: ['Wave Rider 29', 'Neo Vista', 'Wave Rebellion Pro 3'] },
  { key: 'puma', name: 'PUMA', models: ['Velocity Nitro 3', 'Deviate Nitro 3', 'Fast-R Nitro Elite 3'] },
] as const;

export function shoeBrandInitials(shoe: Pick<Shoe, 'brand'>): string {
  return shoe.brand.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'S';
}

export function catalogBrandKey(brand: string): string | null {
  const normalized = brand.trim().toLocaleLowerCase();
  return SHOE_CATALOG.find((entry) => entry.name.toLocaleLowerCase() === normalized)?.key ?? null;
}

export const EMPTY_SHOES: Shoe[] = [];

function shoesFile(): File {
  return new File(Paths.document, SHOES_FILE);
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `shoe-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function createShoe(input: {
  brand: string;
  model: string;
  nickname?: string | null;
  type?: ShoeType;
  brandKey?: string | null;
  isDefault?: boolean;
  id?: string;
}): Shoe {
  return {
    id: input.id ?? nextId(),
    brand: input.brand.trim(),
    model: input.model.trim(),
    type: input.type ?? 'road',
    brandKey: input.brandKey ?? null,
    isDefault: input.isDefault === true,
    nickname: input.nickname?.trim() || null,
    addedAt: Date.now(),
    retired: false,
  };
}

export function shoeName(shoe: Shoe): string {
  return shoe.nickname ?? `${shoe.brand} ${shoe.model}`;
}

export function activeShoes(shoes: Shoe[]): Shoe[] {
  return shoes.filter((shoe) => !shoe.retired);
}

export function addShoe(shoes: Shoe[], shoe: Shoe): Shoe[] {
  return [...shoes, shoe];
}

export function removeShoe(shoes: Shoe[], id: string): Shoe[] {
  return shoes.filter((shoe) => shoe.id !== id);
}

export function setShoeRetired(shoes: Shoe[], id: string, retired: boolean): Shoe[] {
  return shoes.map((shoe) => (shoe.id === id ? { ...shoe, retired } : shoe));
}

export function setDefaultShoe(shoes: Shoe[], id: string | null): Shoe[] {
  return shoes.map((shoe) => ({ ...shoe, isDefault: id !== null && shoe.id === id }));
}

function parseShoe(value: unknown): Shoe | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Partial<Shoe>;
  if (typeof raw.id !== 'string' || typeof raw.brand !== 'string' || typeof raw.model !== 'string') {
    return null;
  }
  return {
    id: raw.id,
    brand: raw.brand,
    model: raw.model,
    type: SHOE_TYPES.some((entry) => entry.key === raw.type) ? (raw.type as ShoeType) : 'road',
    brandKey: typeof raw.brandKey === 'string' ? raw.brandKey : null,
    isDefault: raw.isDefault === true,
    nickname: typeof raw.nickname === 'string' && raw.nickname.length > 0 ? raw.nickname : null,
    addedAt: Number.isFinite(raw.addedAt) ? (raw.addedAt as number) : 0,
    retired: raw.retired === true,
  };
}

export async function loadShoes(): Promise<Shoe[]> {
  const file = shoesFile();
  if (!file.exists) {
    return EMPTY_SHOES;
  }
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) {
      return EMPTY_SHOES;
    }
    return parsed.map(parseShoe).filter((shoe): shoe is Shoe => shoe !== null);
  } catch {
    // A damaged file must not take the profile down with it.
    return EMPTY_SHOES;
  }
}

export async function saveShoes(shoes: Shoe[]): Promise<void> {
  const directory = new Directory(Paths.document);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  const file = shoesFile();
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(shoes));
}
