// Input validation utilities for backend services

import { ValidationError } from '../models'

export function validateRequired(value: any, fieldName: string): void {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} is required`)
  }
}

export function validateString(value: any, fieldName: string, minLength?: number, maxLength?: number): void {
  validateRequired(value, fieldName)
  
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`)
  }
  
  if (minLength !== undefined && value.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters long`)
  }
  
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(`${fieldName} must be no more than ${maxLength} characters long`)
  }
}

export function validateEmail(email: string, fieldName: string = 'Email'): void {
  validateString(email, fieldName)
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new ValidationError(`${fieldName} must be a valid email address`)
  }
}

export function validateUrl(url: string, fieldName: string = 'URL'): void {
  validateString(url, fieldName)
  
  try {
    new URL(url)
  } catch {
    throw new ValidationError(`${fieldName} must be a valid URL`)
  }
}

export function validateArray(value: any, fieldName: string, minLength?: number, maxLength?: number): void {
  validateRequired(value, fieldName)
  
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`)
  }
  
  if (minLength !== undefined && value.length < minLength) {
    throw new ValidationError(`${fieldName} must have at least ${minLength} items`)
  }
  
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(`${fieldName} must have no more than ${maxLength} items`)
  }
}

export function validateBoolean(value: any, fieldName: string): void {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${fieldName} must be a boolean`)
  }
}

export function validateDate(value: any, fieldName: string): void {
  validateRequired(value, fieldName)
  
  const date = new Date(value)
  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid date`)
  }
}

export function validateEnum<T>(value: any, enumValues: T[], fieldName: string): void {
  validateRequired(value, fieldName)
  
  if (!enumValues.includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${enumValues.join(', ')}`)
  }
}

export function validateUUID(value: string, fieldName: string): void {
  validateString(value, fieldName)
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(value)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`)
  }
}

export function validateJSON(value: string, fieldName: string): void {
  validateString(value, fieldName)
  
  try {
    JSON.parse(value)
  } catch {
    throw new ValidationError(`${fieldName} must be valid JSON`)
  }
}

// Specific validation functions for application entities

export function validateConversationData(data: any): void {
  validateString(data.id, 'id')
  validateString(data.title, 'title', 1, 200)
  validateArray(data.messages, 'messages')
  validateString(data.model, 'model')
  validateString(data.provider, 'provider')
}

export function validateMessageData(data: any): void {
  validateString(data.id, 'id')
  validateEnum(data.role, ['user', 'assistant', 'system'], 'role')
  validateString(data.content, 'content', 1)
  validateDate(data.timestamp, 'timestamp')
}

export function validateAIProviderData(data: any): void {
  validateString(data.name, 'name', 1, 100)
  validateEnum(data.type, ['local', 'api'], 'type')
  validateBoolean(data.isActive, 'isActive')
  validateBoolean(data.isConnected, 'isConnected')
  
  if (data.apiKey !== undefined && data.apiKey !== null) {
    validateString(data.apiKey, 'apiKey')
  }
}

export function validateAIModelData(data: any): void {
  validateString(data.providerId, 'providerId')
  validateString(data.modelName, 'modelName', 1, 100)
  validateString(data.modelId, 'modelId', 1, 100)
  validateBoolean(data.isDefault, 'isDefault')
  validateBoolean(data.isAvailable, 'isAvailable')
  validateBoolean(data.isSelected, 'isSelected')
}

export function validateSettingData(data: any): void {
  validateString(data.key, 'key', 1, 100)
  validateString(data.value, 'value')
  
  if (data.category !== undefined && data.category !== null) {
    validateString(data.category, 'category', 1, 50)
  }
}