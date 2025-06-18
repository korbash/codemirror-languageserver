/**
 * Error converter utilities for transforming ResponseError to enhanced Error types.
 * Preserves LSP error codes and data while simplifying error handling.
 */

import {
    ResponseError,
    LSPErrorCodes,
    ErrorCodes,
} from 'vscode-languageserver-protocol';

/**
 * Enhanced Error class that preserves LSP-specific information
 */
export class LSPError extends Error {
    public readonly code: number;
    public readonly data: any;
    public readonly method?: string;
    public readonly timestamp: number;

    constructor(message: string, code: number, data?: any, method?: string) {
        super(message);
        this.name = 'LSPError';
        this.code = code;
        this.data = data;
        this.method = method;
        this.timestamp = Date.now();

        // Maintain proper prototype chain
        Object.setPrototypeOf(this, LSPError.prototype);
    }

    /**
     * Check if this is a cancellation error
     */
    isCancellation(): boolean {
        return (
            this.code === LSPErrorCodes.RequestCancelled ||
            this.code === LSPErrorCodes.ServerCancelled
        );
    }

    /**
     * Check if this is a content modification error
     */
    isContentModified(): boolean {
        return this.code === LSPErrorCodes.ContentModified;
    }

    /**
     * Check if this error should prevent retries
     */
    shouldNotRetry(): boolean {
        switch (this.code) {
            case LSPErrorCodes.RequestCancelled:
            case LSPErrorCodes.ServerCancelled:
            case ErrorCodes.MethodNotFound:
            case ErrorCodes.InvalidParams:
                return true;
            default:
                return false;
        }
    }

    /**
     * Get human-readable error type
     */
    getErrorType(): string {
        switch (this.code) {
            case LSPErrorCodes.RequestCancelled:
                return 'Request Cancelled';
            case LSPErrorCodes.ServerCancelled:
                return 'Server Cancelled';
            case LSPErrorCodes.ContentModified:
                return 'Content Modified';
            case LSPErrorCodes.RequestFailed:
                return 'Request Failed';
            case ErrorCodes.ParseError:
                return 'Parse Error';
            case ErrorCodes.InvalidRequest:
                return 'Invalid Request';
            case ErrorCodes.MethodNotFound:
                return 'Method Not Found';
            case ErrorCodes.InvalidParams:
                return 'Invalid Parameters';
            case ErrorCodes.InternalError:
                return 'Internal Error';
            case ErrorCodes.ServerNotInitialized:
                return 'Server Not Initialized';
            case ErrorCodes.UnknownErrorCode:
                return 'Unknown Error Code';
            default:
                return `LSP Error (${this.code})`;
        }
    }

    /**
     * Enhanced toString with LSP context
     */
    toString(): string {
        const parts = [
            `${this.name}: ${this.message}`,
            `Code: ${this.code} (${this.getErrorType()})`,
        ];

        if (this.method) {
            parts.push(`Method: ${this.method}`);
        }

        if (this.data) {
            parts.push(`Data: ${JSON.stringify(this.data)}`);
        }

        return parts.join('\n  ');
    }

    /**
     * Convert to plain object for serialization
     */
    toJSON(): object {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            data: this.data,
            method: this.method,
            timestamp: this.timestamp,
            stack: this.stack,
        };
    }
}

/**
 * Convert ResponseError to LSPError
 */
export function convertResponseError(
    responseError: ResponseError,
    method?: string,
): LSPError {
    return new LSPError(
        responseError.message,
        responseError.code,
        responseError.data,
        method,
    );
}

/**
 * Convert any error to Error (preserving LSPError if already converted)
 */
export function normalizeError(error: unknown, method?: string): Error {
    if (error instanceof LSPError) {
        return error;
    }

    if (error instanceof ResponseError) {
        return convertResponseError(error, method);
    }

    if (error instanceof Error) {
        return error;
    }

    return new Error(String(error));
}

/**
 * Type guard for LSPError
 */
export function isLSPError(error: unknown): error is LSPError {
    return error instanceof LSPError;
}

/**
 * Type guard for ResponseError
 */
export function isResponseError(error: unknown): error is ResponseError {
    return error instanceof ResponseError;
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * Extract error code safely (returns undefined for non-LSP errors)
 */
export function getErrorCode(error: unknown): number | undefined {
    if (isLSPError(error)) {
        return error.code;
    }
    if (isResponseError(error)) {
        return error.code;
    }
    return undefined;
}

/**
 * Check if error indicates cancellation
 */
export function isCancellationError(error: unknown): boolean {
    if (isLSPError(error)) {
        return error.isCancellation();
    }
    if (isResponseError(error)) {
        return (
            error.code === LSPErrorCodes.RequestCancelled ||
            error.code === LSPErrorCodes.ServerCancelled
        );
    }
    if (error instanceof Error) {
        return error.message.toLowerCase().includes('cancel');
    }
    return false;
}

/**
 * Check if error should prevent retries
 */
export function shouldNotRetryError(error: unknown): boolean {
    if (isLSPError(error)) {
        return error.shouldNotRetry();
    }
    if (isResponseError(error)) {
        switch (error.code) {
            case LSPErrorCodes.RequestCancelled:
            case LSPErrorCodes.ServerCancelled:
            case ErrorCodes.MethodNotFound:
            case ErrorCodes.InvalidParams:
                return true;
            default:
                return false;
        }
    }
    if (error instanceof Error && error.message.includes('cancel')) {
        return true;
    }
    return false;
}

/**
 * Create enhanced error with context
 */
export function createLSPError(
    message: string,
    code: number,
    data?: any,
    method?: string,
): LSPError {
    return new LSPError(message, code, data, method);
}

/**
 * Utility for logging errors with proper formatting
 */
export function formatErrorForLogging(
    error: unknown,
    context?: string,
): string {
    const parts: string[] = [];

    if (context) {
        parts.push(`[${context}]`);
    }

    if (isLSPError(error)) {
        parts.push(
            `LSP Error: ${error.message} (Code: ${error.code}, Type: ${error.getErrorType()})`,
        );
        if (error.method) {
            parts.push(`Method: ${error.method}`);
        }
    } else if (isResponseError(error)) {
        parts.push(`ResponseError: ${error.message} (Code: ${error.code})`);
    } else if (error instanceof Error) {
        parts.push(`Error: ${error.message}`);
    } else {
        parts.push(`Unknown error: ${String(error)}`);
    }

    return parts.join(' ');
}
