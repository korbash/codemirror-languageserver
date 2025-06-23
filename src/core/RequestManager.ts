/**
 * RequestManager with state checking and request lifecycle management
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
    totalNotifications: number;
    successfulNotifications: number;
    failedNotifications: number;
}

const DEFAULT_REQUEST_OPTIONS: Required<RequestOptions> = {
    timeout: 1000,
    retries: 1,
    retryCoefficient: 2,
    firstTimeout: 1000,
    abortSignal: undefined as any,
};

export class RequestManager {
    private readonly connection: Connection;
    private requestCounter = 0;
    private readonly pendingRequests = new Map<string, PendingRequest>();
    private readonly stats: RequestStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        cancelledRequests: 0,
        totalNotifications: 0,
        successfulNotifications: 0,
        failedNotifications: 0,
    };

    constructor(connection: Connection) {
        this.connection = connection;
    }

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
     * Send LSP notification with error handling and statistics
     */
    sendNotification<P>(
        connection: Connection,
        method: LSPMethodValue | string,
        params: P,
    ): Result<void, LSPError> {
        this.stats.totalNotifications++;

        try {
            connection.sendNotification(method, params);
            this.stats.successfulNotifications++;
            return Ok(undefined);
        } catch (error) {
            this.stats.failedNotifications++;
            return Err(LSPError.normalize(error));
        }
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

            // Combine user abort signal with timeout for this attempt
            const timeout =
                options.firstTimeout *
                Math.pow(options.retryCoefficient, attempt);
            const combinedSignal = AbortSignal.any([
                abortSignal,
                AbortSignal.timeout(timeout),
            ]);

            let attemptResult: Result<R, LSPError>;
            try {
                const result = await this.connection.sendRequest<R>(
                    method,
                    params,
                    this.createCancellationToken(combinedSignal),
                );
                attemptResult = Ok(result);
                this.stats.successfulRequests++;
                return attemptResult;
            } catch (error) {
                attemptResult = Err(LSPError.normalize(error));
                allErrors.push(attemptResult.error);

                if (pendingRequest.abortController.signal.aborted) {
                    this.stats.cancelledRequests++;
                } else if (
                    attemptResult.error.shouldNotRetry ||
                    attempt >= options.retries
                ) {
                    this.stats.failedRequests++;
                } else {
                    continue;
                }
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

    /**
     * Cancel all pending requests
     */
    cancelAll(reason?: string): void {
        const requestIds = Array.from(this.pendingRequests.keys());
        for (const requestId of requestIds) {
            const pendingRequest = this.pendingRequests.get(requestId);
            if (pendingRequest) {
                pendingRequest.abortController.abort(reason);
                this.stats.cancelledRequests++;
            }
        }
        this.pendingRequests.clear();
    }

    private generateRequestId(): string {
        return `req_${++this.requestCounter}`;
    }

    [Symbol.dispose](): void {
        this.cancelAll('RequestManager disposed');
    }
}
