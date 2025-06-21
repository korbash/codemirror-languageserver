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
    public readonly data?: any;
    public readonly type: 'cancelled' | 'timeout' | 'error';
    public readonly shouldNotRetry: boolean;

    constructor(
        message: string,
        code: number,
        method: string,
        data?: any,
        type?: 'cancelled' | 'timeout' | 'error',
    ) {
        super(message);
        this.code = code;
        this.method = method;
        this.data = data;

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
            responseError.data,
        );
    }
}
