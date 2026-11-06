/**
 * Icon registry (lib/ui/icon-map.ts).
 *
 * One icon family across the whole product: Phosphor, Outline weight.
 * Before this registry the app drew its own glyphs — emoji (`💡`, `🕳️`,
 * `🌊`, `🗑️`) in `app/dispatcher/page.tsx`, `app/crew/page.tsx` and
 * `app/crew/tickets/[id]/page.tsx`, plus a 12px coloured dot in
 * `components/AppHeader.tsx` as the brand mark. Emoji render differently
 * on every platform, cannot be recoloured by a theme token, and read as
 * a consumer messenger rather than a civic service.
 *
 * WHY THE IMPORTS ARE PER-ICON
 * -----------------------------
 * `import { House, MapTrifold } from '@phosphor-icons/react'` pulls the
 * barrel, and the barrel re-exports ~1,500 icons. The per-icon path
 * (`@phosphor-icons/react/dist/ssr/House`) imports exactly one module,
 * so the bundler only ships the icons actually used.
 *
 * The `ssr` entry point is used rather than the default `csr` one
 * because these components render inside Next.js SERVER components.
 * The CSR build attaches a `useContext` + effect to every icon, which
 * cannot run on the server; the SSR build is a plain function component
 * that renders static SVG.
 */

import type { Icon, IconWeight } from '@phosphor-icons/react';
import {
  ArrowClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowUp,
  Buildings,
  Bell,
  Camera,
  CaretDown,
  CaretRight,
  ChartLineUp,
  CheckCircle,
  Check,
  CircleNotch,
  ClipboardText,
  Clock,
  Copy,
  Crosshair,
  DownloadSimple,
  DotsThree,
  Drop,
  Export,
  Eye,
  Funnel,
  Globe,
  HardHat,
  House,
  Image,
  Info,
  List,
  Lightbulb,
  ListChecks,
  MagnifyingGlass,
  MapPinArea,
  Note,
  LockKey,
  Phone,
  MapPin,
  MapTrifold,
  PencilSimple,
  Polygon,
  PlusCircle,
  Pulse,
  SealCheck,
  RoadHorizon,
  Scroll,
  SignIn,
  SignOut,
  SprayBottle,
  Sun,
  Moon,
  ShieldCheck,
  Timer,
  Trash,
  TreeStructure,
  TrashSimple,
  UserPlus,
  Users,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react/dist/ssr';

export type { Icon };

/**
 * The registry's shape: a named icon at a fixed weight.
 *
 * The weight is baked in so every icon in the product draws with the
 * same stroke weight. Mixing regular and bold Phosphor icons side by
 * side looks like a mistake even when each icon is individually correct.
 */
export interface IconEntry {
  icon: Icon;
  weight: IconWeight;
}

/**
 * The single weight used across the app.
 *
 * `regular` is the default for Phosphor and reads correctly at the
 * 16–24px sizes this app uses. `bold` is reserved for the small
 * status dots where an extra stroke is needed to survive at 12px.
 */
export const ICON_WEIGHT: IconWeight = 'regular';

/** The weight for a status dot that must stay legible at 12px. */
export const ICON_WEIGHT_STRONG: IconWeight = 'bold';

function entry(icon: Icon, weight: IconWeight = ICON_WEIGHT): IconEntry {
  return { icon, weight };
}

/* ---------------------------------------------------------------------------
 * Navigation and surface icons
 * ------------------------------------------------------------------------- */

export const ICONS = {
  /* Navigation */
  home: entry(House),
  feed: entry(MapTrifold),
  reports: entry(ClipboardText),
  queue: entry(ListChecks),
  audit: entry(Scroll),
  map: entry(MapTrifold),
  monitor: entry(Pulse),
  performance: entry(ChartLineUp),

  /* Actions */
  newReport: entry(PlusCircle),
  addUser: entry(UserPlus),
  users: entry(Users),
  dedup: entry(Copy),
  taxonomy: entry(TreeStructure),
  wards: entry(Polygon),
  city: entry(Buildings),

  /* Status */
  statusSubmitted: entry(CircleNotch),
  statusRouted: entry(ArrowSquareOut),
  statusInProgress: entry(Clock),
  statusResolved: entry(CheckCircle),
  statusPaused: entry(Clock),
  statusError: entry(XCircle),
  statusWarning: entry(WarningCircle),
  info: entry(Info),
  loading: entry(CircleNotch),

  /* Trend direction — the arrow that carries a KPI's direction of change.
     A shape, not a glyph: the arrow means "up" the way a bar means
     "more", and it recolours with the theme the way a text glyph
     cannot. */
  trendUp: entry(ArrowUp),
  trendDown: entry(ArrowDown),
  trendFlat: entry(CaretRight),

  /* Auth */
  signIn: entry(SignIn),
  signOut: entry(SignOut),
  lock: entry(LockKey),
  back: entry(ArrowLeft),

  /* Media and location */
  camera: entry(Camera),
  image: entry(Image),
  mapPin: entry(MapPin),
  crosshair: entry(Crosshair),

  /* Chrome and utility — the icon family used by the app shell,
   * filters, data surfaces and the auth funnel. */
  menu: entry(List),
  close: entry(X),
  check: entry(Check),
  chevronRight: entry(CaretRight),
  chevronDown: entry(CaretDown),
  search: entry(MagnifyingGlass),
  filter: entry(Funnel),
  sort: entry(ArrowClockwise),
  forward: entry(ArrowRight),
  backAlt: entry(ArrowLeft),
  notifications: entry(Bell),
  download: entry(DownloadSimple),
  export: entry(Export),
  eye: entry(Eye),
  edit: entry(PencilSimple),
  remove: entry(TrashSimple),
  note: entry(Note),
  phone: entry(Phone),
  language: entry(Globe),
  sun: entry(Sun),
  moon: entry(Moon),
  lightMode: entry(Sun),
  darkMode: entry(Moon),
  security: entry(ShieldCheck),
  verified: entry(SealCheck),
  crew: entry(HardHat),
  serviceArea: entry(MapPinArea),
  sla: entry(Timer),
} as const;

/** A key of the {@link ICONS} registry. */
export type IconName = keyof typeof ICONS;

/**
 * Category slug → icon.
 *
 * The slug is the stable machine key (the id `cat_streetlight` never
 * matched — see the comment above the old `categoryIcon` helper in
 * `app/dispatcher/page.tsx`).
 *
 * The categories mirror the Dhaka seed template in `lib/dhaka-template.ts`
 * and the `category.*` i18n keys.
 */
export const CATEGORY_ICONS: Record<string, IconEntry> = {
  streetlight: entry(Lightbulb),
  pothole: entry(RoadHorizon),
  drainage: entry(Drop),
  garbage: entry(Trash),
  sanitation: entry(SprayBottle),
  other: entry(DotsThree),
};

/**
 * The icon for a category slug.
 *
 * Falls back to the `other` glyph for an unknown or missing slug, so a
 * category added to the seed without a registry entry still renders a
 * sensible icon rather than nothing.
 */
export function categoryIcon(slug: string | null | undefined): IconEntry {
  if (!slug) return CATEGORY_ICONS.other;
  return CATEGORY_ICONS[slug] ?? CATEGORY_ICONS.other;
}

/**
 * The token that tints a category's icon.
 *
 * Each category has its own accent so the tile grid is scannable by
 * shape AND colour — never by colour alone (the icon shape carries the
 * distinction for colour-blind users).
 */
export const CATEGORY_ICON_COLORS: Record<string, string> = {
  streetlight: 'var(--color-cat-streetlight)',
  pothole: 'var(--color-cat-pothole)',
  garbage: 'var(--color-cat-garbage)',
  drainage: 'var(--color-cat-drain)',
  sanitation: 'var(--color-cat-sanitation)',
  other: 'var(--color-cat-other)',
};

/** The colour token for a category's icon, falling back to `other`. */
export function categoryIconColor(slug: string | null | undefined): string {
  if (!slug) return CATEGORY_ICON_COLORS.other;
  return CATEGORY_ICON_COLORS[slug] ?? CATEGORY_ICON_COLORS.other;
}
