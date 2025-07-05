// Calendar Colors Utility - Centralized color management for calendar providers

export interface ProviderColors {
  primary: string
  light: string
  dark: string
  contrast: string
}

export const PROVIDER_COLORS: Record<'microsoft' | 'google', ProviderColors> = {
  microsoft: {
    primary: '#0078d4',
    light: '#0078d415', // 15% opacity
    dark: '#004578',
    contrast: '#ffffff'
  },
  google: {
    primary: '#4285f4',
    light: '#4285f415', // 15% opacity  
    dark: '#1a73e8',
    contrast: '#ffffff'
  }
}

export const getProviderColor = (provider: 'microsoft' | 'google', variant: keyof ProviderColors = 'primary'): string => {
  return PROVIDER_COLORS[provider]?.[variant] || '#6b7280'
}

export const getProviderColorWithOpacity = (provider: 'microsoft' | 'google', opacity: number = 0.15): string => {
  const baseColor = getProviderColor(provider, 'primary')
  // Convert hex to RGB and add opacity
  const hex = baseColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export const getEventStyles = (provider: 'microsoft' | 'google') => ({
  backgroundColor: getProviderColor(provider, 'light'),
  borderLeftColor: getProviderColor(provider, 'primary'),
  color: getProviderColor(provider, 'dark')
})

export const getAllDayEventStyles = (provider: 'microsoft' | 'google') => ({
  backgroundColor: getProviderColor(provider, 'primary'),
  borderColor: getProviderColor(provider, 'dark'),
  color: getProviderColor(provider, 'contrast')
})

// Provider icons and metadata
export const PROVIDER_METADATA = {
  microsoft: {
    name: 'Microsoft',
    shortName: 'MS',
    icon: '🏢',
    meetingIcon: '📹',
    meetingName: 'Teams'
  },
  google: {
    name: 'Google',
    shortName: 'G',
    icon: '🔵',
    meetingIcon: '🎥',
    meetingName: 'Meet'
  }
}

export const getProviderMetadata = (provider: 'microsoft' | 'google') => {
  return PROVIDER_METADATA[provider] || {
    name: 'Unknown',
    shortName: '?',
    icon: '❓',
    meetingIcon: '📞',
    meetingName: 'Meeting'
  }
}

// Calendar theme variations
export const CALENDAR_THEMES = {
  default: {
    background: '#ffffff',
    border: '#e5e7eb',
    text: '#374151',
    textLight: '#6b7280',
    todayBackground: '#f3f4f6',
    todayText: '#1f2937',
    currentTimeColor: '#ef4444'
  },
  dark: {
    background: '#1f2937',
    border: '#374151',
    text: '#f9fafb',
    textLight: '#d1d5db',
    todayBackground: '#374151',
    todayText: '#f9fafb',
    currentTimeColor: '#f87171'
  }
}

export const getCalendarTheme = (isDark: boolean = false) => {
  return isDark ? CALENDAR_THEMES.dark : CALENDAR_THEMES.default
}