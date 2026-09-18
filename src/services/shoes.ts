/**
 * Running shoes (#112).
 *
 * Deliberately small: a shoe is something the runner owns, and its one useful
 * fact is how far it has been run in. Mileage is derived from runs attributed
 * to it — never estimated, and no wear or lifespan prediction is offered,
 * because ROAM has no basis for one.
 */

import { Directory, File, Paths } from 'expo-file-system';

const SHOES_FILE = 'shoes.json';

export type Shoe = {
  id: string;
  brand: string;
  model: string;
  /** An optional pet name, e.g. "the blue ones". */
  nickname: string | null;
  /** Epoch milliseconds. */
  addedAt: number;
  /** A retired shoe keeps its history but is not offered for new runs. */
  retired: boolean;
};

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
  id?: string;
}): Shoe {
  return {
    id: input.id ?? nextId(),
    brand: input.brand.trim(),
    model: input.model.trim(),
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
