"use strict";
// Centralized logging utility for backend services
Object.defineProperty(exports, "__esModule", { value: true });
exports.appLogger = exports.authLogger = exports.databaseLogger = exports.aiProviderLogger = exports.conversationLogger = exports.LogLevel = void 0;
exports.createLogger = createLogger;
var LogLevel;
(function (LogLevel) {
    LogLevel["ERROR"] = "error";
    LogLevel["WARN"] = "warn";
    LogLevel["INFO"] = "info";
    LogLevel["DEBUG"] = "debug";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(serviceName) {
        this.serviceName = serviceName;
    }
    log(level, message, data, error) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.serviceName,
            message,
            data,
            error
        };
        // Format the log message
        const formattedMessage = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.serviceName}] ${message}`;
        // Log to console with appropriate level
        switch (level) {
            case LogLevel.ERROR:
                console.error('❌', formattedMessage, error || data || '');
                break;
            case LogLevel.WARN:
                console.warn('⚠️', formattedMessage, data || '');
                break;
            case LogLevel.INFO:
                console.log('ℹ️', formattedMessage, data || '');
                break;
            case LogLevel.DEBUG:
                console.debug('🐛', formattedMessage, data || '');
                break;
        }
    }
    error(message, error, data) {
        this.log(LogLevel.ERROR, message, data, error);
    }
    warn(message, data) {
        this.log(LogLevel.WARN, message, data);
    }
    info(message, data) {
        this.log(LogLevel.INFO, message, data);
    }
    debug(message, data) {
        this.log(LogLevel.DEBUG, message, data);
    }
    success(message, data) {
        const formattedMessage = `[${new Date().toISOString()}] [SUCCESS] [${this.serviceName}] ${message}`;
        console.log('✅', formattedMessage, data || '');
    }
}
// Factory function to create loggers for different services
function createLogger(serviceName) {
    return new Logger(serviceName);
}
// Pre-configured loggers for common services
exports.conversationLogger = createLogger('ConversationService');
exports.aiProviderLogger = createLogger('AIProviderService');
exports.databaseLogger = createLogger('DatabaseService');
exports.authLogger = createLogger('AuthService');
exports.appLogger = createLogger('Application');
