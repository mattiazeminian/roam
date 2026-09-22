/**
 * The running-shoe catalog (#148).
 *
 * A small, curated list of real brands and their current models, so a runner
 * can find the shoe they actually run in rather than typing a name. It is
 * bundled, not fetched: no network, no backend, and no catalogue entry is ever
 * required for a stored shoe to keep working — the shoe itself carries its own
 * display fields.
 *
 * Brand marks come from the Simple Icons set where that set carries the brand
 * (Nike, adidas, New Balance, PUMA). A brand without an openly licensed vector
 * mark renders its wordmark instead, never a drawn approximation of a logo.
 *
 * Model names are the current generations at the time of writing; add new ones
 * as they release. Nothing here is a recommendation or a ranking.
 */

export type ShoeBrand = {
  key: string;
  name: string;
  /** Simple Icons 24×24 path, when a real open vector mark exists. */
  iconPath?: string;
  models: string[];
};

const NIKE_PATH =
  'M24 7.8L6.442 15.276c-1.456.616-2.679.925-3.668.925-1.12 0-1.933-.392-2.437-1.177-.317-.504-.41-1.143-.28-1.918.13-.775.476-1.6 1.036-2.478.467-.71 1.232-1.643 2.297-2.8a6.122 6.122 0 00-.784 1.848c-.28 1.195-.028 2.072.756 2.632.373.261.886.392 1.54.392.522 0 1.11-.084 1.764-.252L24 7.8z';

const ADIDAS_PATH =
  'm24 19.535-8.697-15.07-4.659 2.687 7.145 12.383Zm-8.287 0L9.969 9.59 5.31 12.277l4.192 7.258ZM4.658 14.723l2.776 4.812H1.223L0 17.41Z';

const NEW_BALANCE_PATH =
  'M12.169 10.306l1.111-1.937 3.774-.242.132-.236-3.488-.242.82-1.414h6.47c1.99 0 3.46.715 2.887 2.8-.17.638-.979 2.233-3.356 2.899.507.06 1.76.616 1.54 2.057-.384 2.558-3.69 3.774-5.533 3.774l-7.641.006-.38-1.48 4.005-.28.137-.237-4.346-.264-.467-1.755 6.178-.363.137-.231-11.096-.693.534-.925 11.948-.775.138-.231-3.504-.231m5 .385l1.1-.006c.738-.005 1.502-.34 1.783-1.018.259-.632-.088-1.171-.55-1.166h-1.067l-1.266 2.19zm-1.27 2.195l-1.326 2.305h1.265c.589 0 1.64-.292 1.964-1.128.302-.781-.253-1.177-.638-1.177h-1.266zM6.26 16.445l-.77 1.315L0 17.77l.534-.923 5.726-.402zm.385-10.216l4.417.006.336 1.248-5.276-.33.523-.924zm5 2.245l.484 1.832-7.542-.495.528-.92 6.53-.417zm-3.84 5.281l-.957 1.661-5.32-.302.534-.924 5.743-.435z';

const PUMA_PATH =
  'M23.845 3.008c-.417-.533-1.146-.106-1.467.08-2.284 1.346-2.621 3.716-3.417 5.077-.626 1.09-1.652 1.89-2.58 1.952-.686.049-1.43-.084-2.168-.405-1.807-.781-2.78-1.792-3.017-1.97-.487-.37-4.23-4.015-7.28-4.164 0 0-.372-.75-.465-.763-.222-.025-.45.451-.616.501-.15.053-.413-.512-.565-.487-.153.02-.302.586-.6.877-.22.213-.486.2-.637.463-.052.096-.034.265-.093.42-.127.32-.551.354-.555.697 0 .381.357.454.669.72.248.212.265.362.554.461.258.088.632-.187.964-.088.277.081.543.14.602.423.054.256 0 .658-.34.613-.112-.015-.598-.174-1.198-.11-.725.077-1.553.309-1.634 1.11-.041.447.514.97 1.055.866.371-.071.196-.506.399-.716.267-.27 1.772.944 3.172.944.593 0 1.031-.15 1.467-.605.04-.029.093-.102.155-.11a.632.632 0 01.195.088c1.131.897 1.984 2.7 6.13 2.721.582.007 1.25.279 1.796.777.48.433.764 1.125 1.037 1.825.418 1.053 1.161 2.069 2.292 3.203.06.068.99.78 1.06.833.012.01.084.167.053.255-.02.69-.123 2.67 1.365 2.753.366.02.275-.231.275-.41-.005-.341-.065-.685.113-1.04.253-.478-.526-.709-.509-1.756.019-.784-.645-.651-.984-1.25-.19-.343-.368-.532-.35-.946.073-2.38-.517-3.948-.805-4.327-.227-.294-.423-.403-.207-.54 1.24-.815 1.525-1.574 1.525-1.574.66-1.541 1.256-2.945 2.075-3.57.166-.12.589-.44.852-.56.763-.362 1.173-.578 1.388-.788.356-.337.635-1.053.294-1.48z';

export const SHOE_BRANDS: readonly ShoeBrand[] = [
  {
    key: 'nike',
    name: 'Nike',
    iconPath: NIKE_PATH,
    models: ['Pegasus 41', 'Vomero 18', 'Vomero Plus', 'Zoom Fly 6', 'Vaporfly 4', 'Alphafly 3'],
  },
  {
    key: 'adidas',
    name: 'adidas',
    iconPath: ADIDAS_PATH,
    models: [
      'Adizero EVO SL',
      'Adizero Adios Pro 4',
      'Adizero Boston 13',
      'Adizero Adios 9',
      'Supernova Rise 3',
      'Ultraboost 5X',
    ],
  },
  {
    key: 'asics',
    name: 'ASICS',
    models: [
      'GEL-Nimbus 28',
      'GEL-Kayano 33',
      'Novablast 6',
      'Novablast 5',
      'Superblast 3',
      'Megablast',
      'GEL-Cumulus 28',
      'GT-2000 15',
      'Metaspeed Sky Tokyo',
      'Magic Speed 5',
    ],
  },
  {
    key: 'new-balance',
    name: 'New Balance',
    iconPath: NEW_BALANCE_PATH,
    models: [
      'Fresh Foam X 1080 v15',
      'Fresh Foam X More v6',
      'FuelCell SuperComp Elite v5',
      'FuelCell SuperComp Trainer v3',
      'FuelCell Rebel v5',
      'Fresh Foam X Hierro v9',
    ],
  },
  {
    key: 'hoka',
    name: 'HOKA',
    models: ['Clifton 10', 'Bondi 9', 'Mach 7', 'Rocket X 3', 'Arahi 8', 'Speedgoat 6'],
  },
  {
    key: 'brooks',
    name: 'Brooks',
    models: [
      'Ghost 18',
      'Ghost 17',
      'Adrenaline GTS 25',
      'Glycerin 23',
      'Hyperion Max 4',
      'Hyperion Elite 5',
      'Launch 12',
    ],
  },
  {
    key: 'saucony',
    name: 'Saucony',
    models: ['Endorphin Speed 5', 'Endorphin Pro 5', 'Endorphin Pro 4', 'Endorphin Azura', 'Ride 18', 'Triumph 22'],
  },
  {
    key: 'on',
    name: 'On',
    models: [
      'Cloudmonster 3',
      'Cloudsurfer 2',
      'Cloudrunner 3',
      'Cloudboom Strike',
      'Cloudflow 5',
      'Cloudstratus 3',
    ],
  },
  {
    key: 'mizuno',
    name: 'Mizuno',
    models: ['Wave Rider 29', 'Wave Sky 9', 'Wave Inspire 22', 'Wave Rebellion Pro 3', 'Neo Vista 3'],
  },
  {
    key: 'puma',
    name: 'PUMA',
    iconPath: PUMA_PATH,
    models: ['Deviate Nitro Elite 4', 'Fast-R Nitro Elite 3', 'Velocity Nitro 3', 'Deviate Nitro 3'],
  },
] as const;

/** The catalog in the legacy shape the shoe store already used. */
export const SHOE_CATALOG = SHOE_BRANDS.map((brand) => ({
  key: brand.key,
  name: brand.name,
  models: brand.models,
}));

export function findBrand(key: string | null | undefined): ShoeBrand | null {
  if (!key) {
    return null;
  }
  return SHOE_BRANDS.find((brand) => brand.key === key) ?? null;
}

/** The catalog brand for a stored brand name, if it matches one exactly. */
export function catalogBrandKey(brand: string): string | null {
  const normalized = brand.trim().toLocaleLowerCase();
  return SHOE_BRANDS.find((entry) => entry.name.toLocaleLowerCase() === normalized)?.key ?? null;
}

export function brandInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'S'
  );
}
