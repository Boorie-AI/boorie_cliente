"use strict";
// Input validation utilities for backend services
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequired = validateRequired;
exports.validateString = validateString;
exports.validateEmail = validateEmail;
exports.validateUrl = validateUrl;
exports.validateArray = validateArray;
exports.validateBoolean = validateBoolean;
exports.validateDate = validateDate;
exports.validateEnum = validateEnum;
exports.validateUUID = validateUUID;
exports.validateJSON = validateJSON;
exports.validateConversationData = validateConversationData;
exports.validateMessageData = validateMessageData;
exports.validateAIProviderData = validateAIProviderData;
exports.validateAIModelData = validateAIModelData;
exports.validateSettingData = validateSettingData;
const models_1 = require("../models");
function validateRequired(value, fieldName) {
    if (value === null || value === undefined || value === '') {
        throw new models_1.ValidationError(`${fieldName} is required`);
    }
}
function validateString(value, fieldName, minLength, maxLength) {
    validateRequired(value, fieldName);
    if (typeof value !== 'string') {
        throw new models_1.ValidationError(`${fieldName} must be a string`);
    }
    if (minLength !== undefined && value.length < minLength) {
        throw new models_1.ValidationError(`${fieldName} must be at least ${minLength} characters long`);
    }
    if (maxLength !== undefined && value.length > maxLength) {
        throw new models_1.ValidationError(`${fieldName} must be no more than ${maxLength} characters long`);
    }
}
function validateEmail(email, fieldName = 'Email') {
    validateString(email, fieldName);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new models_1.ValidationError(`${fieldName} must be a valid email address`);
    }
}
function validateUrl(url, fieldName = 'URL') {
    validateString(url, fieldName);
    try {
        new URL(url);
    }
    catch {
        throw new models_1.ValidationError(`${fieldName} must be a valid URL`);
    }
}
function validateArray(value, fieldName, minLength, maxLength) {
    validateRequired(value, fieldName);
    if (!Array.isArray(value)) {
        throw new models_1.ValidationError(`${fieldName} must be an array`);
    }
    if (minLength !== undefined && value.length < minLength) {
        throw new models_1.ValidationError(`${fieldName} must have at least ${minLength} items`);
    }
    if (maxLength !== undefined && value.length > maxLength) {
        throw new models_1.ValidationError(`${fieldName} must have no more than ${maxLength} items`);
    }
}
function validateBoolean(value, fieldName) {
    if (typeof value !== 'boolean') {
        throw new models_1.ValidationError(`${fieldName} must be a boolean`);
    }
}
function validateDate(value, fieldName) {
    validateRequired(value, fieldName);
    const date = new Date(value);
    if (isNaN(date.getTime())) {
        throw new models_1.ValidationError(`${fieldName} must be a valid date`);
    }
}
function validateEnum(value, enumValues, fieldName) {
    validateRequired(value, fieldName);
    if (!enumValues.includes(value)) {
        throw new models_1.ValidationError(`${fieldName} must be one of: ${enumValues.join(', ')}`);
    }
}
function validateUUID(value, fieldName) {
    validateString(value, fieldName);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
        throw new models_1.ValidationError(`${fieldName} must be a valid UUID`);
    }
}
function validateJSON(value, fieldName) {
    validateString(value, fieldName);
    try {
        JSON.parse(value);
    }
    catch {
        throw new models_1.ValidationError(`${fieldName} must be valid JSON`);
    }
}
// Specific validation functions for application entities
function validateConversationData(data) {
    validateString(data.id, 'id');
    validateString(data.title, 'title', 1, 200);
    validateArray(data.messages, 'messages');
    validateString(data.model, 'model');
    validateString(data.provider, 'provider');
}
function validateMessageData(data) {
    validateString(data.id, 'id');
    validateEnum(data.role, ['user', 'assistant', 'system'], 'role');
    validateString(data.content, 'content', 1);
    validateDate(data.timestamp, 'timestamp');
}
function validateAIProviderData(data) {
    validateString(data.name, 'name', 1, 100);
    validateEnum(data.type, ['local', 'api'], 'type');
    validateBoolean(data.isActive, 'isActive');
    validateBoolean(data.isConnected, 'isConnected');
    if (data.apiKey !== undefined && data.apiKey !== null) {
        validateString(data.apiKey, 'apiKey');
    }
}
function validateAIModelData(data) {
    validateString(data.providerId, 'providerId');
    validateString(data.modelName, 'modelName', 1, 100);
    validateString(data.modelId, 'modelId', 1, 100);
    validateBoolean(data.isDefault, 'isDefault');
    validateBoolean(data.isAvailable, 'isAvailable');
    validateBoolean(data.isSelected, 'isSelected');
}
function validateSettingData(data) {
    validateString(data.key, 'key', 1, 100);
    validateString(data.value, 'value');
    if (data.category !== undefined && data.category !== null) {
        validateString(data.category, 'category', 1, 50);
    }
}
