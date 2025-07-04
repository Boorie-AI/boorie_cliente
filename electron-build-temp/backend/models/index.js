"use strict";
// Backend Models and Interfaces
// Centralized type definitions for the backend services
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.AIProviderError = exports.DatabaseError = exports.ServiceError = void 0;
// Error Types
class ServiceError extends Error {
    constructor(message, code, statusCode = 500) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'ServiceError';
    }
}
exports.ServiceError = ServiceError;
class DatabaseError extends ServiceError {
    constructor(message, originalError) {
        super(message, 'DATABASE_ERROR', 500);
        this.name = 'DatabaseError';
        if (originalError) {
            this.stack = originalError.stack;
        }
    }
}
exports.DatabaseError = DatabaseError;
class AIProviderError extends ServiceError {
    constructor(message, provider) {
        super(`${provider}: ${message}`, 'AI_PROVIDER_ERROR', 502);
        this.name = 'AIProviderError';
    }
}
exports.AIProviderError = AIProviderError;
class ValidationError extends ServiceError {
    constructor(message) {
        super(message, 'VALIDATION_ERROR', 400);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
