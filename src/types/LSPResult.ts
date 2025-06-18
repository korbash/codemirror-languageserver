/**
 * Zed-style result system for LSP operations with type-safe error handling.
 * Integrates with Microsoft's vscode-languageserver-protocol error types.
 */

import { ResponseError, LSPErrorCodes } from 'vscode-languageserver-protocol';

/**
 * Result states for LSP operations
 */
export enum ConnectionResult {
    Success = 'success',
    Timeout = 'timeout',
    ConnectionReset = 'connection_reset',
    Cancelled = 'cancelled',
    Error = 'error',
}

/**
 * LSP operation result with comprehensive error handling
 */
export class LSPResult<T> {
    private constructor(
        private readonly state: ConnectionResult,
        private readonly value?: T,
        private readonly error?: Error | ResponseError,
        private readonly reason?: string,
    ) {}

    /**
     * Create a successful result
     */
    static success<T>(value: T): LSPResult<T> {
        return new LSPResult(ConnectionResult.Success, value);
    }

    /**
     * Create a timeout result
     */
    static timeout<T = never>(reason?: string): LSPResult<T> {
        return new LSPResult(
            ConnectionResult.Timeout,
            undefined,
            undefined,
            reason,
        ) as LSPResult<T>;
    }

    /**
     * Create a connection reset result
     */
    static connectionReset<T = never>(reason?: string): LSPResult<T> {
        return new LSPResult(
            ConnectionResult.ConnectionReset,
            undefined,
            undefined,
            reason,
        ) as LSPResult<T>;
    }

    /**
     * Create a cancelled result
     */
    static cancelled<T = never>(reason?: string): LSPResult<T> {
        return new LSPResult(
            ConnectionResult.Cancelled,
            undefined,
            undefined,
            reason,
        ) as LSPResult<T>;
    }

    /**
     * Create an error result
     */
    static error<T = never>(error: Error | ResponseError): LSPResult<T> {
        return new LSPResult(
            ConnectionResult.Error,
            undefined,
            error,
        ) as LSPResult<T>;
    }

    /**
     * Create result from Microsoft ResponseError
     */
    static fromResponseError<T>(error: ResponseError): LSPResult<T> {
        switch (error.code) {
            case LSPErrorCodes.RequestCancelled:
                return LSPResult.cancelled(error.message);
            case LSPErrorCodes.ServerCancelled:
                return LSPResult.cancelled(
                    `Server cancelled: ${error.message}`,
                );
            case LSPErrorCodes.ContentModified:
                return LSPResult.error(error);
            default:
                return LSPResult.error(error);
        }
    }

    /**
     * Check if result is successful
     */
    isSuccess(): this is LSPResult<T> & { getValue(): T } {
        return this.state === ConnectionResult.Success;
    }

    /**
     * Check if result is an error
     */
    isError(): boolean {
        return this.state === ConnectionResult.Error;
    }

    /**
     * Check if result is timeout
     */
    isTimeout(): boolean {
        return this.state === ConnectionResult.Timeout;
    }

    /**
     * Check if result is cancelled
     */
    isCancelled(): boolean {
        return this.state === ConnectionResult.Cancelled;
    }

    /**
     * Check if connection was reset
     */
    isConnectionReset(): boolean {
        return this.state === ConnectionResult.ConnectionReset;
    }

    /**
     * Get the successful value (throws if not successful)
     */
    getValue(): T {
        if (this.state !== ConnectionResult.Success) {
            throw new Error(`Cannot get value from ${this.state} result`);
        }
        return this.value!;
    }

    /**
     * Get the error (returns undefined if not an error)
     */
    getError(): Error | ResponseError | undefined {
        return this.error;
    }

    /**
     * Get the reason (for timeout, cancellation, etc.)
     */
    getReason(): string | undefined {
        return this.reason;
    }

    /**
     * Get the result state
     */
    getState(): ConnectionResult {
        return this.state;
    }

    /**
     * Pattern matching for result handling (side effects only)
     * Only success handler is required, others are optional with default behavior
     */
    match(patterns: {
        success: (value: T) => void;
        timeout?: (reason?: string) => void;
        connectionReset?: (reason?: string) => void;
        cancelled?: (reason?: string) => void;
        error?: (error: Error | ResponseError) => void;
    }): void {
        switch (this.state) {
            case ConnectionResult.Success:
                patterns.success(this.value!);
                break;
            case ConnectionResult.Timeout:
                if (patterns.timeout) {
                    patterns.timeout(this.reason);
                } else {
                    // Default timeout behavior
                    console.warn(
                        `LSP timeout: ${this.reason || 'Unknown reason'}`,
                    );
                }
                break;
            case ConnectionResult.ConnectionReset:
                if (patterns.connectionReset) {
                    patterns.connectionReset(this.reason);
                } else {
                    // Default connection reset behavior
                    console.warn(
                        `LSP connection reset: ${this.reason || 'Unknown reason'}`,
                    );
                }
                break;
            case ConnectionResult.Cancelled:
                if (patterns.cancelled) {
                    patterns.cancelled(this.reason);
                } else {
                    // Default cancelled behavior
                    console.log(
                        `LSP request cancelled: ${this.reason || 'Unknown reason'}`,
                    );
                }
                break;
            case ConnectionResult.Error:
                if (patterns.error) {
                    patterns.error(this.error!);
                } else {
                    // Default error behavior
                    console.error(
                        'LSP error:',
                        this.error?.message || 'Unknown error',
                    );
                }
                break;
        }
    }

    /**
     * Get value or default
     */
    getOrElse(defaultValue: T): T {
        return this.state === ConnectionResult.Success
            ? this.value!
            : defaultValue;
    }

    /**
     * Convert to Promise (throws on error states)
     */
    toPromise(): Promise<T> {
        switch (this.state) {
            case ConnectionResult.Success:
                return Promise.resolve(this.value!);
            case ConnectionResult.Timeout:
                return Promise.reject(
                    new Error(
                        `Request timeout: ${this.reason || 'Unknown reason'}`,
                    ),
                );
            case ConnectionResult.ConnectionReset:
                return Promise.reject(
                    new Error(
                        `Connection reset: ${this.reason || 'Unknown reason'}`,
                    ),
                );
            case ConnectionResult.Cancelled:
                return Promise.reject(
                    new Error(
                        `Request cancelled: ${this.reason || 'Unknown reason'}`,
                    ),
                );
            case ConnectionResult.Error:
                return Promise.reject(this.error!);
        }
    }

    /**
     * Convert to optional value (undefined on any error)
     */
    toOptional(): T | undefined {
        return this.state === ConnectionResult.Success ? this.value : undefined;
    }

    /**
     * String representation for debugging
     */
    toString(): string {
        switch (this.state) {
            case ConnectionResult.Success:
                return `LSPResult.Success(${this.value})`;
            case ConnectionResult.Timeout:
                return `LSPResult.Timeout(${this.reason || 'no reason'})`;
            case ConnectionResult.ConnectionReset:
                return `LSPResult.ConnectionReset(${this.reason || 'no reason'})`;
            case ConnectionResult.Cancelled:
                return `LSPResult.Cancelled(${this.reason || 'no reason'})`;
            case ConnectionResult.Error:
                return `LSPResult.Error(${this.error?.message || 'unknown error'})`;
        }
    }
}

/**
 * Utility type for async operations that return LSPResult
 */
export type LSPResultPromise<T> = Promise<LSPResult<T>>;

/**
 * Helper function to wrap Microsoft's Connection.sendRequest with LSPResult
 */
export function wrapConnectionRequest<T>(
    promise: Promise<T>,
): LSPResultPromise<T> {
    return promise
        .then((result) => LSPResult.success(result))
        .catch((error) => {
            if (error instanceof ResponseError) {
                return LSPResult.fromResponseError(error);
            }
            return LSPResult.error(error);
        });
}
