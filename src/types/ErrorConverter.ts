/**
 * Simplified LSP error handling with ts-custom-error
 */

import { CustomError } from 'ts-custom-error';
import {
    ResponseError,
    LSPErrorCodes,
    ErrorCodes,
} from 'vscode-languageserver-protocol';

/**
 * Simple LSP Error that extends CustomError
 */
export class LSPError extends CustomError {
    public readonly code: number;
    public readonly method: string;
    public readonly type: 'cancelled' | 'timeout' | 'error';
    public readonly source: string;
    public readonly shouldNotRetry: boolean;

    constructor(
        message: string,
        code: number,
        method: string,
        stack?: string,
        cause?: unknown,
        type?: 'cancelled' | 'timeout' | 'error',
        source?: string,
    ) {
        super(message);
        this.code = code;
        this.method = method;
        this.stack = stack;
        this.cause = cause;
        this.source = source ?? 'LSPError';
        // Calculate type based on provided type or code
        if (type) {
            this.type = type;
        } else {
            switch (code) {
                case LSPErrorCodes.RequestCancelled:
                case LSPErrorCodes.ServerCancelled:
                    this.type = 'cancelled';
                    break;
                default:
                    this.type = 'error';
                    break;
            }
        }

        // Calculate shouldNotRetry based on code
        switch (code) {
            case LSPErrorCodes.RequestCancelled:
            case LSPErrorCodes.ServerCancelled:
            case ErrorCodes.MethodNotFound:
            case ErrorCodes.InvalidParams:
                this.shouldNotRetry = true;
                break;
            default:
                this.shouldNotRetry = false;
                break;
        }
    }

    /**
     * Create LSPError from ResponseError
     */
    static fromResponseError(
        responseError: ResponseError,
        method: string,
    ): LSPError {
        return new LSPError(
            responseError.message,
            responseError.code,
            method,
            responseError.stack,
            responseError.cause,
            undefined, // type will be calculated from code
            'ResponseError', // source
        );
    }
    static normalize(error: unknown, method: string = 'unknown') {
        if (error instanceof LSPError) {
            return error;
        } else if (error instanceof ResponseError) {
            return this.fromResponseError(error, method);
        } else if (error instanceof Error) {
            return new LSPError(
                error.message,
                ErrorCodes.InternalError,
                method,
                error.stack,
                error.cause,
                undefined,
                error.constructor.name,
            );
        } else {
            return new LSPError(
                String(error),
                ErrorCodes.InternalError,
                method,
                undefined,
                undefined,
                undefined,
                'unknown',
            );
        }
    }
}
