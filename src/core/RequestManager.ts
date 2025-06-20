/**
 * Simplified RequestManager - only stats and cancellation by ID
 */

import { Connection } from 'vscode-languageserver';
import { LSPResult, LSPMethodValue, RequestOptions } from '../types/index.js';
import {
    normalizeError,
    shouldNotRetryError,
} from '../types/ErrorConverter.js';

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
    async sendRequest<P, R>(
        method: LSPMethodValue,
        params: P,
        options: RequestOptions = {},
    ): Promise<LSPResult<R>> {
        const requestOptions = { ...DEFAULT_REQUEST_OPTIONS, ...options };
        const requestId = this.generateRequestId();

        // Create pending request
        const abortController = new AbortController();
        if (requestOptions.abortSignal) {
            if (requestOptions.abortSignal.aborted) {
                abortController.abort(requestOptions.abortSignal.reason);
            } else {
                requestOptions.abortSignal.addEventListener('abort', () => {
                    abortController.abort(requestOptions.abortSignal!.reason);
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

        try {
            const result = await this.executeRequest(
                method,
                params,
                pendingRequest,
                requestOptions,
            );
            this.stats.successfulRequests++;
            return LSPResult.success(result as R);
        } catch (error) {
            if (abortController.signal.aborted) {
                this.stats.cancelledRequests++;
                return LSPResult.cancelled('Request was cancelled');
            } else {
                this.stats.failedRequests++;
                return LSPResult.error(normalizeError(error, method));
            }
        } finally {
            this.pendingRequests.delete(requestId);
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
     * Execute request with retry logic
     */
    private async executeRequest<P, R>(
        method: LSPMethodValue | string,
        params: P,
        pendingRequest: PendingRequest,
        options: Required<RequestOptions>,
    ): Promise<R> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= options.retries; attempt++) {
            try {
                pendingRequest.retryCount = attempt;

                if (pendingRequest.abortController.signal.aborted) {
                    throw new Error('Request was aborted');
                }

                // Setup timeout for this attempt
                const timeoutController = new AbortController();
                const timeout = setTimeout(() => {
                    timeoutController.abort('Request timeout');
                }, options.timeout);

                // Combine abort signals
                const combinedController = new AbortController();
                const cleanup = () => {
                    clearTimeout(timeout);
                    combinedController.abort();
                };

                pendingRequest.abortController.signal.addEventListener(
                    'abort',
                    cleanup,
                );
                timeoutController.signal.addEventListener('abort', cleanup);

                try {
                    const result = await this.connection.sendRequest(
                        method,
                        params,
                        this.createCancellationToken(combinedController.signal),
                    );
                    clearTimeout(timeout);
                    return result as R;
                } finally {
                    pendingRequest.abortController.signal.removeEventListener(
                        'abort',
                        cleanup,
                    );
                    timeoutController.signal.removeEventListener(
                        'abort',
                        cleanup,
                    );
                    clearTimeout(timeout);
                }
            } catch (error) {
                lastError =
                    error instanceof Error ? error : new Error(String(error));

                if (pendingRequest.abortController.signal.aborted) {
                    throw lastError;
                }

                if (shouldNotRetryError(error) || attempt >= options.retries) {
                    throw lastError;
                }

                // Wait before retry with exponential backoff
                if (attempt < options.retries) {
                    const delay =
                        options.firstTimeout *
                        Math.pow(options.retryCoefficient, attempt);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError || new Error('Request failed after all retries');
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
