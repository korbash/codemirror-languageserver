/**
 * Request Manager for LSP operations with Zed-style timeout and cancellation.
 *
 * This class manages LSP requests using Microsoft's Connection infrastructure
 * while adding Zed-style improvements for timeout handling, cancellation,
 * performance monitoring, and result wrapping.
 */

import {
    RequestType,
    ProtocolRequestType,
    CancellationToken,
    CancellationTokenSource,
    ResponseError,
    LSPErrorCodes,
    Disposable,
} from 'vscode-languageserver-protocol';

import { Connection } from 'vscode-languageserver';

import {
    LSPResult,
    wrapConnectionRequest,
    RequestOptions,
    Subscription,
    CompositeSubscription,
    createSubscription,
} from '../types';

/**
 * Pending request tracking
 */
interface PendingRequest {
    id: string;
    method: string;
    startTime: number;
    timeout: number;
    cancellationSource: CancellationTokenSource;
    timeoutHandle: number;
    retryCount: number;
    maxRetries: number;
}

/**
 * Request statistics for monitoring
 */
export interface RequestStats {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    timeoutRequests: number;
    cancelledRequests: number;
    averageResponseTime: number;
    requestsByMethod: Record<string, number>;
}

/**
 * Request performance metrics
 */
interface RequestMetrics {
    method: string;
    duration: number;
    success: boolean;
    error?: string;
    retryCount: number;
    timestamp: number;
}

/**
 * Default request configuration
 */
const DEFAULT_REQUEST_OPTIONS: Required<
    Omit<RequestOptions, 'cancellationToken'>
> & { cancellationToken?: CancellationToken } = {
    timeout: 30000, // 30 seconds
    retries: 0,
    cancellationToken: undefined,
};

/**
 * Manages LSP requests with advanced timeout, cancellation, and monitoring
 */
export class RequestManager implements Disposable {
    private connection?: Connection;
    private disposed = false;
    private requestCounter = 0;

    // Request tracking
    private readonly pendingRequests = new Map<string, PendingRequest>();
    private readonly subscriptions = new CompositeSubscription();

    // Statistics and monitoring
    private readonly stats: RequestStats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        timeoutRequests: 0,
        cancelledRequests: 0,
        averageResponseTime: 0,
        requestsByMethod: {},
    };

    private readonly responseTimeHistory: number[] = [];
    private readonly maxHistorySize = 100;

    // Event handlers
    private readonly metricsHandlers = new Set<
        (metrics: RequestMetrics) => void
    >();
    private readonly statsHandlers = new Set<(stats: RequestStats) => void>();

    constructor() {
        this.setupCleanupInterval();
    }

    /**
     * Set the Microsoft Connection instance
     */
    setConnection(connection: Connection): void {
        this.connection = connection;
    }

    /**
     * Send a typed LSP request
     */
    async sendRequest<P, R>(
        requestType:
            | RequestType<P, R, any>
            | ProtocolRequestType<P, R, any, any, any>,
        params: P,
        options: RequestOptions = {},
    ): Promise<LSPResult<R>> {
        if (!this.connection) {
            return LSPResult.error(new Error('No active connection'));
        }

        if (this.disposed) {
            return LSPResult.error(
                new Error('RequestManager has been disposed'),
            );
        }

        const requestOptions = {
            ...DEFAULT_REQUEST_OPTIONS,
            ...options,
        } as Required<RequestOptions>;
        const requestId = this.generateRequestId();
        const method =
            'method' in requestType ? requestType.method : String(requestType);

        // Create pending request tracking
        const pendingRequest = this.createPendingRequest(
            requestId,
            method,
            requestOptions,
        );

        this.pendingRequests.set(requestId, pendingRequest);
        this.updateStats('start', method);

        try {
            // Send the request using Microsoft's Connection
            const startTime = Date.now();
            const result = await this.executeRequest(
                requestType,
                params,
                pendingRequest,
            );

            const duration = Date.now() - startTime;
            this.recordSuccess(
                requestId,
                method,
                duration,
                pendingRequest.retryCount,
            );

            return LSPResult.success(result);
        } catch (error) {
            const duration = Date.now() - pendingRequest.startTime;
            return this.handleRequestError(
                error,
                requestId,
                method,
                duration,
                pendingRequest,
            );
        } finally {
            this.cleanupRequest(requestId);
        }
    }

    /**
     * Cancel a specific request
     */
    cancelRequest(requestId: string, reason?: string): boolean {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (!pendingRequest) {
            return false;
        }

        pendingRequest.cancellationSource.cancel();
        this.recordCancellation(requestId, pendingRequest.method, reason);
        this.cleanupRequest(requestId);

        return true;
    }

    /**
     * Cancel all pending requests
     */
    cancelAllRequests(reason?: string): void {
        for (const [requestId, pendingRequest] of this.pendingRequests) {
            pendingRequest.cancellationSource.cancel();
            this.recordCancellation(requestId, pendingRequest.method, reason);
        }
        this.pendingRequests.clear();
    }

    /**
     * Get current request statistics
     */
    getStats(): RequestStats {
        return { ...this.stats };
    }

    /**
     * Get list of pending requests
     */
    getPendingRequests(): Array<{
        id: string;
        method: string;
        duration: number;
    }> {
        const now = Date.now();
        return Array.from(this.pendingRequests.values()).map((req) => ({
            id: req.id,
            method: req.method,
            duration: now - req.startTime,
        }));
    }

    /**
     * Subscribe to request metrics
     */
    onMetrics(handler: (metrics: RequestMetrics) => void): Subscription {
        this.metricsHandlers.add(handler);
        return createSubscription(
            () => this.metricsHandlers.delete(handler),
            'request-metrics-handler',
        );
    }

    /**
     * Subscribe to statistics updates
     */
    onStats(handler: (stats: RequestStats) => void): Subscription {
        this.statsHandlers.add(handler);
        return createSubscription(
            () => this.statsHandlers.delete(handler),
            'request-stats-handler',
        );
    }

    /**
     * Microsoft Disposable interface
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;

        // Cancel all pending requests
        this.cancelAllRequests('RequestManager disposed');

        // Dispose subscriptions
        this.subscriptions.dispose();

        // Clear handlers
        this.metricsHandlers.clear();
        this.statsHandlers.clear();
    }

    // === Private Methods ===

    /**
     * Execute the actual request with retry logic
     */
    private async executeRequest<P, R>(
        requestType:
            | RequestType<P, R, any>
            | ProtocolRequestType<P, R, any, any, any>,
        params: P,
        pendingRequest: PendingRequest,
    ): Promise<R> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= pendingRequest.maxRetries; attempt++) {
            try {
                pendingRequest.retryCount = attempt;

                // Check if request was cancelled
                if (
                    pendingRequest.cancellationSource.token
                        .isCancellationRequested
                ) {
                    throw new Error('Request was cancelled');
                }

                // Send request using Microsoft Connection
                const result = await this.connection!.sendRequest(
                    requestType,
                    params,
                    pendingRequest.cancellationSource.token,
                );

                return result;
            } catch (error) {
                lastError =
                    error instanceof Error ? error : new Error(String(error));

                // Don't retry on cancellation or certain error types
                if (
                    this.shouldNotRetry(
                        error,
                        attempt,
                        pendingRequest.maxRetries,
                    )
                ) {
                    throw lastError;
                }

                // Wait before retry (exponential backoff)
                if (attempt < pendingRequest.maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError || new Error('Request failed after all retries');
    }

    /**
     * Create pending request tracking object
     */
    private createPendingRequest(
        id: string,
        method: string,
        options: Required<RequestOptions>,
    ): PendingRequest {
        const cancellationSource = new CancellationTokenSource();

        // Combine user cancellation token with our own
        if (options.cancellationToken) {
            if (options.cancellationToken.isCancellationRequested) {
                cancellationSource.cancel();
            } else {
                // Link the user's cancellation token to ours
                const disposable =
                    options.cancellationToken.onCancellationRequested(() => {
                        cancellationSource.cancel();
                    });
                // Clean up the link when our token is cancelled
                cancellationSource.token.onCancellationRequested(() => {
                    disposable.dispose();
                });
            }
        }

        // Setup timeout
        const timeoutHandle = setTimeout(() => {
            cancellationSource.cancel();
            this.recordTimeout(id, method);
        }, options.timeout) as any;

        return {
            id,
            method,
            startTime: Date.now(),
            timeout: options.timeout,
            cancellationSource,
            timeoutHandle,
            retryCount: 0,
            maxRetries: options.retries,
        };
    }

    /**
     * Handle request errors with appropriate LSPResult conversion
     */
    private handleRequestError(
        error: unknown,
        requestId: string,
        method: string,
        duration: number,
        pendingRequest: PendingRequest,
    ): LSPResult<never> {
        if (error instanceof ResponseError) {
            this.recordFailure(
                requestId,
                method,
                duration,
                error.message,
                pendingRequest.retryCount,
            );

            // Convert Microsoft LSP errors to our result types
            switch (error.code) {
                case LSPErrorCodes.RequestCancelled:
                case LSPErrorCodes.ServerCancelled:
                    return LSPResult.cancelled(error.message);
                case LSPErrorCodes.ContentModified:
                    return LSPResult.error(error);
                default:
                    return LSPResult.error(error);
            }
        }

        const errorMessage =
            error instanceof Error ? error.message : String(error);

        // Check for timeout
        if (pendingRequest.cancellationSource.token.isCancellationRequested) {
            if (
                Date.now() - pendingRequest.startTime >=
                pendingRequest.timeout
            ) {
                return LSPResult.timeout(
                    `Request timed out after ${pendingRequest.timeout}ms`,
                );
            } else {
                return LSPResult.cancelled('Request was cancelled');
            }
        }

        this.recordFailure(
            requestId,
            method,
            duration,
            errorMessage,
            pendingRequest.retryCount,
        );
        return LSPResult.error(
            error instanceof Error ? error : new Error(errorMessage),
        );
    }

    /**
     * Check if error should prevent retries
     */
    private shouldNotRetry(
        error: unknown,
        attempt: number,
        maxRetries: number,
    ): boolean {
        if (attempt >= maxRetries) {
            return true;
        }

        if (error instanceof ResponseError) {
            // Don't retry on these LSP errors
            switch (error.code) {
                case LSPErrorCodes.RequestCancelled:
                case LSPErrorCodes.ServerCancelled:
                case -32601: // MethodNotFound
                case -32602: // InvalidParams
                    return true;
            }
        }

        // Don't retry on cancellation
        if (error instanceof Error && error.message.includes('cancel')) {
            return true;
        }

        return false;
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        return `req_${++this.requestCounter}_${Date.now()}`;
    }

    /**
     * Clean up request tracking
     */
    private cleanupRequest(requestId: string): void {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (pendingRequest) {
            clearTimeout(pendingRequest.timeoutHandle);
            pendingRequest.cancellationSource.dispose();
            this.pendingRequests.delete(requestId);
        }
    }

    /**
     * Record successful request
     */
    private recordSuccess(
        requestId: string,
        method: string,
        duration: number,
        retryCount: number,
    ): void {
        this.stats.successfulRequests++;
        this.updateResponseTime(duration);
        this.emitMetrics({
            method,
            duration,
            success: true,
            retryCount,
            timestamp: Date.now(),
        });
    }

    /**
     * Record failed request
     */
    private recordFailure(
        requestId: string,
        method: string,
        duration: number,
        error: string,
        retryCount: number,
    ): void {
        this.stats.failedRequests++;
        this.updateResponseTime(duration);
        this.emitMetrics({
            method,
            duration,
            success: false,
            error,
            retryCount,
            timestamp: Date.now(),
        });
    }

    /**
     * Record timeout
     */
    private recordTimeout(requestId: string, method: string): void {
        this.stats.timeoutRequests++;
        this.emitMetrics({
            method,
            duration:
                Date.now() - this.pendingRequests.get(requestId)!.startTime,
            success: false,
            error: 'timeout',
            retryCount: this.pendingRequests.get(requestId)!.retryCount,
            timestamp: Date.now(),
        });
    }

    /**
     * Record cancellation
     */
    private recordCancellation(
        requestId: string,
        method: string,
        reason?: string,
    ): void {
        this.stats.cancelledRequests++;
        this.emitMetrics({
            method,
            duration:
                Date.now() - this.pendingRequests.get(requestId)!.startTime,
            success: false,
            error: `cancelled: ${reason || 'unknown reason'}`,
            retryCount: this.pendingRequests.get(requestId)!.retryCount,
            timestamp: Date.now(),
        });
    }

    /**
     * Update statistics
     */
    private updateStats(event: 'start', method: string): void {
        this.stats.totalRequests++;
        this.stats.requestsByMethod[method] =
            (this.stats.requestsByMethod[method] || 0) + 1;
    }

    /**
     * Update response time statistics
     */
    private updateResponseTime(duration: number): void {
        this.responseTimeHistory.push(duration);
        if (this.responseTimeHistory.length > this.maxHistorySize) {
            this.responseTimeHistory.shift();
        }

        this.stats.averageResponseTime =
            this.responseTimeHistory.reduce((sum, time) => sum + time, 0) /
            this.responseTimeHistory.length;
    }

    /**
     * Emit metrics to handlers
     */
    private emitMetrics(metrics: RequestMetrics): void {
        for (const handler of this.metricsHandlers) {
            try {
                handler(metrics);
            } catch (error) {
                console.error('Error in metrics handler:', error);
            }
        }
    }

    /**
     * Setup cleanup interval for stale requests
     */
    private setupCleanupInterval(): void {
        const cleanup = () => {
            const now = Date.now();
            const staleRequests: string[] = [];

            for (const [id, request] of this.pendingRequests) {
                // Clean up requests that have been pending for more than 2x their timeout
                if (now - request.startTime > request.timeout * 2) {
                    staleRequests.push(id);
                }
            }

            for (const id of staleRequests) {
                this.cancelRequest(id, 'stale request cleanup');
            }
        };

        const intervalId = setInterval(cleanup, 60000) as any; // Every minute

        this.subscriptions.add(
            createSubscription(
                () => clearInterval(intervalId),
                'cleanup-interval',
            ),
        );
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
