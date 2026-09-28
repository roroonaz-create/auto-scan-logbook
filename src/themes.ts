export type ThemeId = 'desktop-navy';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  emoji: string;
  mode: 'light';
  badgeLabel: string;
  
  // Container & Page
  pageBg: string;
  navBg: string;
  navBorder: string;
  
  // Cards & Surfaces
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  
  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  
  // Accents & Buttons
  primaryGradient: string;
  primaryButtonText: string;
  accentColor: string;
  accentRing: string;
  
  // Status & Badges
  tagBg: string;
  tagText: string;
  tagBorder: string;
  
  // Table Styling
  tableHeaderBg: string;
  tableHeaderText: string;
  tableRowHover: string;
  tableRowSelected: string;
  tableBorder: string;
  tableCellDiff: string;
  
  // Banner
  bannerGradient: string;
  bannerBorder: string;
  bannerText: string;
}

export const CLEAN_THEME: ThemeConfig = {
  id: 'desktop-navy',
  name: 'Desktop Slate Navy',
  emoji: '',
  mode: 'light',
  badgeLabel: 'TSV Tool',
  
  pageBg: 'bg-slate-100',
  navBg: 'bg-white',
  navBorder: 'border-slate-200',
  
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  cardShadow: 'shadow-xs',
  
  textPrimary: 'text-slate-900',
  textSecondary: 'text-slate-600',
  textMuted: 'text-slate-400',
  
  primaryGradient: 'bg-blue-700 hover:bg-blue-800 text-white',
  primaryButtonText: 'text-white',
  accentColor: 'text-blue-700',
  accentRing: 'ring-blue-600',
  
  tagBg: 'bg-slate-100',
  tagText: 'text-slate-800',
  tagBorder: 'border-slate-200',
  
  tableHeaderBg: 'bg-slate-50',
  tableHeaderText: 'text-slate-700',
  tableRowHover: 'hover:bg-slate-50',
  tableRowSelected: 'bg-blue-50/60',
  tableBorder: 'border-slate-200',
  tableCellDiff: 'bg-amber-50 text-amber-900 border-amber-300',
  
  bannerGradient: 'bg-slate-50',
  bannerBorder: 'border-slate-200',
  bannerText: 'text-slate-800',
};

export const ANIME_THEMES: Record<string, ThemeConfig> = {
  'desktop-navy': CLEAN_THEME,
  'clean-indigo': CLEAN_THEME,
  cyber: CLEAN_THEME,
  sakura: CLEAN_THEME,
  ghibli: CLEAN_THEME,
  sunset: CLEAN_THEME,
  shinobi: CLEAN_THEME,
  classic: CLEAN_THEME,
};
