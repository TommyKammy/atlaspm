export const SIDEBAR_MODE_COOKIE = 'atlaspm_sidebar_mode';
export const CONTENT_LAYOUT_COOKIE = 'atlaspm_content_layout';
export const THEME_PRESET_COOKIE = 'atlaspm_theme_preset';
export const LOCALE_COOKIE = 'atlaspm_locale';

export type SidebarMode = 'full' | 'icon';
export type ContentLayout = 'full' | 'centered';
export type ThemePreset = 'default' | 'tangerine';
export type Locale = 'en' | 'ja';

export const DEFAULT_SIDEBAR_MODE: SidebarMode = 'icon';
export const DEFAULT_CONTENT_LAYOUT: ContentLayout = 'full';
export const DEFAULT_THEME_PRESET: ThemePreset = 'default';
export const DEFAULT_LOCALE: Locale = 'en';

export function parseSidebarMode(value?: string): SidebarMode {
  return value === 'full' ? 'full' : value === 'icon' ? 'icon' : DEFAULT_SIDEBAR_MODE;
}

export function parseContentLayout(value?: string): ContentLayout {
  return value === 'centered' ? 'centered' : DEFAULT_CONTENT_LAYOUT;
}

export function parseThemePreset(value?: string): ThemePreset {
  return value === 'tangerine' ? 'tangerine' : DEFAULT_THEME_PRESET;
}

export function parseLocale(value?: string): Locale {
  return value === 'ja' ? 'ja' : DEFAULT_LOCALE;
}
