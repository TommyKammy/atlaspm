export const SIDEBAR_MODE_COOKIE = 'atlaspm_sidebar_mode';
export const CONTENT_LAYOUT_COOKIE = 'atlaspm_content_layout';
export const THEME_PRESET_COOKIE = 'atlaspm_theme_preset';

export type SidebarMode = 'full' | 'icon';
export type ContentLayout = 'full' | 'centered';
export type ThemePreset = 'default' | 'tangerine';

export const DEFAULT_SIDEBAR_MODE: SidebarMode = 'full';
export const DEFAULT_CONTENT_LAYOUT: ContentLayout = 'full';
export const DEFAULT_THEME_PRESET: ThemePreset = 'default';

export function parseSidebarMode(value?: string): SidebarMode {
  return value === 'icon' ? 'icon' : DEFAULT_SIDEBAR_MODE;
}

export function parseContentLayout(value?: string): ContentLayout {
  return value === 'centered' ? 'centered' : DEFAULT_CONTENT_LAYOUT;
}

export function parseThemePreset(value?: string): ThemePreset {
  return value === 'tangerine' ? 'tangerine' : DEFAULT_THEME_PRESET;
}
