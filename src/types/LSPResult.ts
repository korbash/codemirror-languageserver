/**
 * Zed-style result system for LSP operations with type-safe error handling.
 * Integrates with Microsoft's vscode-languageserver-protocol error types.
 */

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
        private readonly error?: Error,
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
    static error<T = never>(error: Error): LSPResult<T> {
        return new LSPResult(
            ConnectionResult.Error,
            undefined,
            error,
        ) as LSPResult<T>;
    }

    /**
     * Check if result is successful
     */
    isSuccess(): this is LSPResult<T> & { getValue(): T } {
        return this.state === ConnectionResult.Success;
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
    getError(): Error | undefined {
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
     * Handle result with optional callbacks for each state
     * Returns the value if successful, undefined otherwise
     */
    handleResult(
        patterns: {
            success?: (value: T) => void;
            timeout?: (reason?: string) => void;
            connectionReset?: (reason?: string) => void;
            cancelled?: (reason?: string) => void;
            error?: (error: Error) => void;
        } = {},
    ): T | undefined {
        switch (this.state) {
            case ConnectionResult.Success:
                if (patterns.success) {
                    patterns.success(this.value!);
                }
                return this.value!;
            case ConnectionResult.Timeout:
                if (patterns.timeout) {
                    patterns.timeout(this.reason);
                } else {
                    // Default timeout behavior
                    console.warn(
                        `LSP timeout: ${this.reason || 'Unknown reason'}`,
                    );
                }
                return undefined;
            case ConnectionResult.ConnectionReset:
                if (patterns.connectionReset) {
                    patterns.connectionReset(this.reason);
                } else {
                    // Default connection reset behavior
                    console.warn(
                        `LSP connection reset: ${this.reason || 'Unknown reason'}`,
                    );
                }
                return undefined;
            case ConnectionResult.Cancelled:
                if (patterns.cancelled) {
                    patterns.cancelled(this.reason);
                } else {
                    // Default cancelled behavior
                    console.log(
                        `LSP request cancelled: ${this.reason || 'Unknown reason'}`,
                    );
                }
                return undefined;
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
                return undefined;
        }
    }
}
