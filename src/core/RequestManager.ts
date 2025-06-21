/**
 * Simplified RequestManager - only stats and cancellation by ID
 */

import { Connection } from 'vscode-languageserver';
import { ErrorCodes, LSPErrorCodes } from 'vscode-languageserver-protocol';
import { Result, Ok, Err, AsyncResult } from 'ts-results-es';
import { LSPMethodValue, RequestOptions } from '../types/index.js';
import { LSPError } from '../types/ErrorConverter.js';

interface PendingRequest {
    id: string;
    method: string;
    abortController: AbortController;
    retryCount: number;
}

export interface RequestStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    cancelledRequests: number;
}

const DEFAULT_REQUEST_OPTIONS: Required<RequestOptions> = {
    timeout: 1000,
    retries: 1,
    retryCoefficient: 2,
    firstTimeout: 1000,
    abortSignal: undefined as any,
};

export class RequestManager {
    private requestCounter = 0;
    private readonly pendingRequests = new Map<string, PendingRequest>();
    private readonly stats: RequestStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        cancelledRequests: 0,
    };

    constructor(private readonly connection: Connection) {}

    /**
     * Send LSP request with simplified options
     */
    sendRequest<P, R>(
        method: LSPMethodValue,
        params: P,
        options: RequestOptions = {},
    ): AsyncResult<R, LSPError[]> {
        const requestOptions = { ...DEFAULT_REQUEST_OPTIONS, ...options };
        const requestId = this.generateRequestId();

        // Create pending request
        const abortController = new AbortController();
        if (requestOptions.abortSignal) {
            if (requestOptions.abortSignal.aborted) {
                abortController.abort(requestOptions.abortSignal.reason);
            } else {
                requestOptions.abortSignal.addEventListener('abort', () => {
                    abortController.abort(requestOptions.abortSignal.reason);
                });
            }
        }

        const pendingRequest: PendingRequest = {
            id: requestId,
            method,
            abortController,
            retryCount: 0,
        };

        this.pendingRequests.set(requestId, pendingRequest);
        this.stats.totalRequests++;

        // Pass user abort signal to executeRequest
        // executeRequest will handle individual attempt timeouts

        const resultPromise = this.executeRequest<P, R>(
            method,
            params,
            pendingRequest,
            requestOptions,
            pendingRequest.abortController.signal,
        ).finally(() => {
            this.pendingRequests.delete(requestId);
        });

        return new AsyncResult<R, LSPError[]>(resultPromise);
    }

    /**
     * Cancel request by ID
     */
    cancelRequest(requestId: string, reason?: string): boolean {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (!pendingRequest) {
            return false;
        }

        pendingRequest.abortController.abort(reason);
        this.pendingRequests.delete(requestId);
        this.stats.cancelledRequests++;
        return true;
    }

    /**
     * Get current statistics
     */
    getStats(): RequestStats {
        return { ...this.stats };
    }

    /**
     * Get pending request IDs
     */
    getPendingRequestIds(): string[] {
        return Array.from(this.pendingRequests.keys());
    }

    /**
     * Execute request with retry logic using functional Result patterns
     */
    private async executeRequest<P, R>(
        method: LSPMethodValue | string,
        params: P,
        pendingRequest: PendingRequest,
        options: Required<RequestOptions>,
        abortSignal: AbortSignal,
    ): Promise<Result<R, LSPError[]>> {
        const allErrors: LSPError[] = [];

        for (let attempt = 0; attempt <= options.retries; attempt++) {
            pendingRequest.retryCount = attempt;

            // Check if aborted early
            if (pendingRequest.abortController.signal.aborted) {
                this.stats.cancelledRequests++;
                return Err([
                    ...allErrors,
                    new LSPError(
                        'Request was aborted',
                        LSPErrorCodes.RequestCancelled,
                        method,
                    ),
                ]);
            }

            // Calculate timeout for this attempt (grows with retries)
            const attemptTimeout =
                options.firstTimeout *
                Math.pow(options.retryCoefficient, attempt);

            // Create timeout controller for this attempt
            const timeoutController = new AbortController();
            const timeout = setTimeout(() => {
                timeoutController.abort('Request timeout');
            }, attemptTimeout);

            // Combine user abort signal with timeout for this attempt
            const combinedSignal = AbortSignal.any([
                abortSignal,
                timeoutController.signal,
            ]);

            // Use Result.wrapAsync for the request operation
            const attemptResult = await Result.wrapAsync(async () => {
                try {
                    const result = await this.connection.sendRequest(
                        method,
                        params,
                        this.createCancellationToken(combinedSignal),
                    );
                    this.stats.successfulRequests++;
                    return result as R;
                } finally {
                    clearTimeout(timeout);
                }
            }).then((result) =>
                result.mapErr((error) =>
                    error instanceof LSPError
                        ? error
                        : new LSPError(
                              error instanceof Error
                                  ? error.message
                                  : String(error),
                              ErrorCodes.InternalError,
                              method,
                          ),
                ),
            );

            // Handle successful result
            if (attemptResult.isOk()) {
                return Ok(attemptResult.unwrap());
            }

            // Handle error case
            const error = attemptResult.unwrapErr();
            allErrors.push(error);

            if (pendingRequest.abortController.signal.aborted) {
                this.stats.cancelledRequests++;
                return Err(allErrors);
            }

            if (error.shouldNotRetry || attempt >= options.retries) {
                this.stats.failedRequests++;
                return Err(allErrors);
            }
        }

        // All retries exhausted
        this.stats.failedRequests++;
        return Err(
            allErrors.length > 0
                ? allErrors
                : [
                      new LSPError(
                          'Request failed after all retries',
                          ErrorCodes.InternalError,
                          method,
                      ),
                  ],
        );
    }

    /**
     * Convert AbortSignal to CancellationToken
     */
    private createCancellationToken(signal: AbortSignal): any {
        return {
            isCancellationRequested: signal.aborted,
            onCancellationRequested: (callback: () => void) => {
                if (signal.aborted) {
                    callback();
                    return { dispose: () => {} };
                }

                signal.addEventListener('abort', callback);
                return {
                    dispose: () =>
                        signal.removeEventListener('abort', callback),
                };
            },
        };
    }

    private generateRequestId(): string {
        return `req_${++this.requestCounter}`;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
