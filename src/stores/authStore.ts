// Auth Store - Authentication state management with Zustand

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface UserProfile {
  id: string
  provider: string
  providerId: string
  email: string
  name?: string
  pictureUrl?: string
  isActive: boolean
  metadata?: any
  createdAt: string
  updatedAt: string
}

export interface ConnectionStatus {
  isConnected: boolean
  hasTokens: boolean
  hasProfile: boolean
  isExpired: boolean
  expiresAt?: string
  userEmail?: string
  userName?: string
  error?: string
}

export interface AuthState {
  // Connection status for each provider
  connectionStatus: {
    microsoft: ConnectionStatus
    google: ConnectionStatus
  }
  
  // User profiles
  userProfiles: UserProfile[]
  
  // Loading states
  isLoading: {
    microsoft: boolean
    google: boolean
    general: boolean
  }
  
  // Error states
  errors: {
    microsoft?: string
    google?: string
    general?: string
  }
  
  // Last updated timestamp
  lastUpdated?: Date

  // Actions
  initializeAuth: () => Promise<void>
  refreshConnectionStatus: () => Promise<void>
  refreshProviderStatus: (provider: 'microsoft' | 'google') => Promise<void>
  
  // OAuth actions
  connectMicrosoft: () => Promise<boolean>
  connectGoogle: () => Promise<boolean>
  disconnect: (provider: 'microsoft' | 'google') => Promise<boolean>
  
  // Profile management
  loadUserProfiles: () => Promise<void>
  getUserProfile: (provider: string) => UserProfile | null
  
  // Token management
  refreshToken: (provider: 'microsoft' | 'google') => Promise<boolean>
  testConnection: (provider: 'microsoft' | 'google') => Promise<boolean>
  
  // Utility actions
  setLoading: (provider: 'microsoft' | 'google' | 'general', loading: boolean) => void
  setError: (provider: 'microsoft' | 'google' | 'general', error?: string) => void
  clearErrors: () => void
}

const initialConnectionStatus: ConnectionStatus = {
  isConnected: false,
  hasTokens: false,
  hasProfile: false,
  isExpired: true
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      // Initial state
      connectionStatus: {
        microsoft: { ...initialConnectionStatus },
        google: { ...initialConnectionStatus }
      },
      userProfiles: [],
      isLoading: {
        microsoft: false,
        google: false,
        general: false
      },
      errors: {},
      lastUpdated: undefined,

      // Initialize authentication state
      initializeAuth: async () => {
        try {
          get().setLoading('general', true)
          get().clearErrors()

          // Load connection status and user profiles in parallel
          await Promise.all([
            get().refreshConnectionStatus(),
            get().loadUserProfiles()
          ])

          set({ lastUpdated: new Date() })
        } catch (error) {
          console.error('Failed to initialize auth:', error)
          get().setError('general', `Initialization failed: ${error.message}`)
        } finally {
          get().setLoading('general', false)
        }
      },

      // Refresh connection status for all providers
      refreshConnectionStatus: async () => {
        try {
          if (!window.electronAPI?.auth) {
            throw new Error('Auth API not available')
          }

          const result = await window.electronAPI.auth.getConnectionStatus()
          
          if (result.success && result.data) {
            set((state) => ({
              connectionStatus: {
                microsoft: result.data.microsoft || initialConnectionStatus,
                google: result.data.google || initialConnectionStatus
              }
            }))
          } else {
            throw new Error(result.error || 'Failed to get connection status')
          }
        } catch (error) {
          console.error('Failed to refresh connection status:', error)
          get().setError('general', `Failed to refresh status: ${error.message}`)
        }
      },

      // Refresh status for a specific provider
      refreshProviderStatus: async (provider: 'microsoft' | 'google') => {
        try {
          get().setLoading(provider, true)
          get().setError(provider, undefined)

          // Refresh overall status and extract provider-specific data
          await get().refreshConnectionStatus()
          
        } catch (error) {
          console.error(`Failed to refresh ${provider} status:`, error)
          get().setError(provider, `Failed to refresh status: ${error.message}`)
        } finally {
          get().setLoading(provider, false)
        }
      },

      // Connect to Microsoft
      connectMicrosoft: async (): Promise<boolean> => {
        try {
          get().setLoading('microsoft', true)
          get().setError('microsoft', undefined)

          if (!window.electronAPI?.auth) {
            throw new Error('Auth API not available')
          }

          const result = await window.electronAPI.auth.microsoftLogin()
          
          if (result.success) {
            // Refresh status and profiles after successful connection
            await Promise.all([
              get().refreshProviderStatus('microsoft'),
              get().loadUserProfiles()
            ])
            
            set({ lastUpdated: new Date() })
            return true
          } else {
            throw new Error(result.error || 'Microsoft login failed')
          }
        } catch (error) {
          console.error('Microsoft connection failed:', error)
          get().setError('microsoft', `Connection failed: ${error.message}`)
          return false
        } finally {
          get().setLoading('microsoft', false)
        }
      },

      // Connect to Google
      connectGoogle: async (): Promise<boolean> => {
        try {
          get().setLoading('google', true)
          get().setError('google', undefined)

          if (!window.electronAPI?.auth) {
            throw new Error('Auth API not available')
          }

          const result = await window.electronAPI.auth.googleLogin()
          
          if (result.success) {
            // Refresh status and profiles after successful connection
            await Promise.all([
              get().refreshProviderStatus('google'),
              get().loadUserProfiles()
            ])
            
            set({ lastUpdated: new Date() })
            return true
          } else {
            throw new Error(result.error || 'Google login failed')
          }
        } catch (error) {
          console.error('Google connection failed:', error)
          get().setError('google', `Connection failed: ${error.message}`)
          return false
        } finally {
          get().setLoading('google', false)
        }
      },

      // Disconnect from a provider
      disconnect: async (provider: 'microsoft' | 'google'): Promise<boolean> => {
        try {
          get().setLoading(provider, true)
          get().setError(provider, undefined)

          if (!window.electronAPI?.auth) {
            throw new Error('Auth API not available')
          }

          const result = await window.electronAPI.auth.logout(provider)
          
          if (result.success) {
            // Refresh status and profiles after successful disconnection
            await Promise.all([
              get().refreshProviderStatus(provider),
              get().loadUserProfiles()
            ])
            
            set({ lastUpdated: new Date() })
            return true
          } else {
            throw new Error(result.error || 'Logout failed')
          }
        } catch (error) {
          console.error(`${provider} disconnection failed:`, error)
          get().setError(provider, `Disconnection failed: ${error.message}`)
          return false
        } finally {
          get().setLoading(provider, false)
        }
      },

      // Load user profiles
      loadUserProfiles: async () => {
        try {
          if (!window.electronAPI?.auth) {
            throw new Error('Auth API not available')
          }

          const result = await window.electronAPI.auth.getActiveProfiles()
          
          if (result.success) {
            set({ userProfiles: result.data || [] })
          } else {
            throw new Error(result.error || 'Failed to load user profiles')
          }
        } catch (error) {
          console.error('Failed to load user profiles:', error)
          get().setError('general', `Failed to load profiles: ${error.message}`)
        }
      },

      // Get user profile for a specific provider
      getUserProfile: (provider: string): UserProfile | null => {
        const profiles = get().userProfiles
        return profiles.find(p => p.provider === provider && p.isActive) || null
      },

      // Refresh token for a provider
      refreshToken: async (provider: 'microsoft' | 'google'): Promise<boolean> => {
        try {
          get().setLoading(provider, true)
          get().setError(provider, undefined)

          if (!window.electronAPI?.auth) {
            throw new Error('Auth API not available')
          }

          const result = await window.electronAPI.auth.refreshToken(provider)
          
          if (result.success) {
            // Refresh status after successful token refresh
            await get().refreshProviderStatus(provider)
            return true
          } else {
            throw new Error(result.error || 'Token refresh failed')
          }
        } catch (error) {
          console.error(`${provider} token refresh failed:`, error)
          get().setError(provider, `Token refresh failed: ${error.message}`)
          return false
        } finally {
          get().setLoading(provider, false)
        }
      },

      // Test connection for a provider
      testConnection: async (provider: 'microsoft' | 'google'): Promise<boolean> => {
        try {
          get().setLoading(provider, true)
          get().setError(provider, undefined)

          if (!window.electronAPI?.auth) {
            throw new Error('Auth API not available')
          }

          const result = await window.electronAPI.auth.testConnection(provider)
          
          if (result.success) {
            // Refresh status after successful test
            await get().refreshProviderStatus(provider)
            return true
          } else {
            throw new Error(result.error || 'Connection test failed')
          }
        } catch (error) {
          console.error(`${provider} connection test failed:`, error)
          get().setError(provider, `Connection test failed: ${error.message}`)
          return false
        } finally {
          get().setLoading(provider, false)
        }
      },

      // Set loading state
      setLoading: (provider: 'microsoft' | 'google' | 'general', loading: boolean) => {
        set((state) => ({
          isLoading: {
            ...state.isLoading,
            [provider]: loading
          }
        }))
      },

      // Set error state
      setError: (provider: 'microsoft' | 'google' | 'general', error?: string) => {
        set((state) => ({
          errors: {
            ...state.errors,
            [provider]: error
          }
        }))
      },

      // Clear all errors
      clearErrors: () => {
        set({ errors: {} })
      }
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        // Only persist user profiles and last updated time
        userProfiles: state.userProfiles,
        lastUpdated: state.lastUpdated
      })
    }
  )
)