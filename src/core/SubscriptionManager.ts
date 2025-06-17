/**
 * Subscription Manager for LSP notifications with Zed-style subscription handling.
 *
 * This class manages LSP notification subscriptions using Microsoft's Connection
 * infrastructure while adding Zed-style improvements for resource management,
 * type safety, and automatic cleanup.
 */

import {
    NotificationType,
    ProtocolNotificationType,
    Disposable,
    PublishDiagnosticsNotification,
    ShowMessageNotification,
    LogMessageNotification,
    TelemetryEventNotification,
    DidOpenTextDocumentNotification,
    DidChangeTextDocumentNotification,
    DidCloseTextDocumentNotification,
    DidSaveTextDocumentNotification,
} from 'vscode-languageserver-protocol';

import { Connection } from 'vscode-languageserver';

import {
    Subscription,
    CompositeSubscription,
    createSubscription,
    wrapDisposable,
    NotificationHandler,
} from '../types/index.js';

/**
 * Subscription entry tracking
 */
interface SubscriptionEntry {
    id: string;
    method: string;
    handler: NotificationHandler<any>;
    subscription: Subscription;
    microsoftDisposable: Disposable;
    createdAt: number;
}

/**
 * Subscription statistics for monitoring
 */
export interface SubscriptionStats {
    totalSubscriptions: number;
    activeSubscriptions: number;
    notificationsReceived: number;
    subscriptionsByMethod: Record<string, number>;
    errorCount: number;
    lastActivity: number;
}

/**
 * Notification metrics for monitoring
 */
interface NotificationMetrics {
    method: string;
    timestamp: number;
    handlerCount: number;
    processingTime: number;
    success: boolean;
    error?: string;
}

/**
 * Options for subscription configuration
 */
export interface SubscriptionManagerOptions {
    /**
     * Enable debug logging
     */
    debug?: boolean;

    /**
     * Custom logger function
     */
    logger?: (message: string, ...args: any[]) => void;

    /**
     * Enable performance monitoring
     */
    enableMonitoring?: boolean;

    /**
     * Maximum number of subscriptions per method
     */
    maxSubscriptionsPerMethod?: number;
}

/**
 * Manages LSP notification subscriptions with Zed-style resource management
 */
export class SubscriptionManager implements Disposable {
    private connection?: Connection;
    private disposed = false;
    private subscriptionCounter = 0;

    // Subscription tracking
    private readonly subscriptions = new Map<string, SubscriptionEntry>();
    private readonly subscriptionsByMethod = new Map<string, Set<string>>();
    private readonly disposables = new CompositeSubscription();

    // Configuration
    private readonly debug: boolean;
    private readonly logger: (message: string, ...args: any[]) => void;
    private readonly enableMonitoring: boolean;
    private readonly maxSubscriptionsPerMethod: number;

    // Statistics and monitoring
    private readonly stats: SubscriptionStats = {
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        notificationsReceived: 0,
        subscriptionsByMethod: {},
        errorCount: 0,
        lastActivity: Date.now(),
    };

    // Event handlers
    private readonly metricsHandlers = new Set<
        (metrics: NotificationMetrics) => void
    >();
    private readonly statsHandlers = new Set<
        (stats: SubscriptionStats) => void
    >();

    constructor(options: SubscriptionManagerOptions = {}) {
        this.debug = options.debug ?? false;
        this.logger = options.logger ?? (() => {});
        this.enableMonitoring = options.enableMonitoring ?? true;
        this.maxSubscriptionsPerMethod =
            options.maxSubscriptionsPerMethod ?? 100;

        if (this.enableMonitoring) {
            this.setupMonitoring();
        }
    }

    /**
     * Set the Microsoft Connection instance
     */
    setConnection(connection: Connection): void {
        this.connection = connection;
        this.log('Connection set, ready for subscriptions');
    }

    /**
     * Subscribe to a typed LSP notification
     */
    onNotification<P>(
        notificationType:
            | NotificationType<P>
            | ProtocolNotificationType<P, any>,
        handler: NotificationHandler<P>,
    ): Subscription {
        if (!this.connection) {
            throw new Error('No active connection');
        }

        if (this.disposed) {
            throw new Error('SubscriptionManager has been disposed');
        }

        const method =
            'method' in notificationType
                ? notificationType.method
                : String(notificationType);

        // Check subscription limits
        this.checkSubscriptionLimits(method);

        const subscriptionId = this.generateSubscriptionId();

        this.log(`Creating subscription for ${method} (id: ${subscriptionId})`);

        // Create wrapped handler with monitoring
        const wrappedHandler = this.createWrappedHandler(method, handler);

        // Subscribe using Microsoft Connection
        const microsoftDisposable = this.connection.onNotification(
            notificationType,
            wrappedHandler,
        );

        // Create our Zed-style subscription
        const subscription = createSubscription(
            () => this.unsubscribe(subscriptionId),
            `notification-${method}-${subscriptionId}`,
            method,
        );

        // Track the subscription
        const entry: SubscriptionEntry = {
            id: subscriptionId,
            method,
            handler,
            subscription,
            microsoftDisposable,
            createdAt: Date.now(),
        };

        this.subscriptions.set(subscriptionId, entry);
        this.trackSubscriptionByMethod(method, subscriptionId);
        this.updateStats('subscribe', method);

        return subscription;
    }

    // === Convenience methods for common LSP notifications ===

    /**
     * Subscribe to textDocument/publishDiagnostics notifications
     */
    onDiagnostics(
        handler: NotificationHandler<
            import('vscode-languageserver-protocol').PublishDiagnosticsParams
        >,
    ): Subscription {
        return this.onNotification(
            PublishDiagnosticsNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to window/showMessage notifications
     */
    onShowMessage(
        handler: NotificationHandler<
            import('vscode-languageserver-protocol').ShowMessageParams
        >,
    ): Subscription {
        return this.onNotification(ShowMessageNotification.type, handler);
    }

    /**
     * Subscribe to window/logMessage notifications
     */
    onLogMessage(
        handler: NotificationHandler<
            import('vscode-languageserver-protocol').LogMessageParams
        >,
    ): Subscription {
        return this.onNotification(LogMessageNotification.type, handler);
    }

    /**
     * Subscribe to $/progress notifications
     */
    onProgress(handler: NotificationHandler<any>): Subscription {
        // Create a custom notification type for progress since it may not be exported
        const progressNotificationType: NotificationType<any> = {
            method: '$/progress',
        } as any;
        return this.onNotification(progressNotificationType, handler);
    }

    /**
     * Subscribe to telemetry/event notifications
     */
    onTelemetryEvent(handler: NotificationHandler<any>): Subscription {
        return this.onNotification(TelemetryEventNotification.type, handler);
    }

    /**
     * Subscribe to textDocument/didOpen notifications
     */
    onDidOpenTextDocument(
        handler: NotificationHandler<
            import('vscode-languageserver-protocol').DidOpenTextDocumentParams
        >,
    ): Subscription {
        return this.onNotification(
            DidOpenTextDocumentNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to textDocument/didChange notifications
     */
    onDidChangeTextDocument(
        handler: NotificationHandler<
            import('vscode-languageserver-protocol').DidChangeTextDocumentParams
        >,
    ): Subscription {
        return this.onNotification(
            DidChangeTextDocumentNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to textDocument/didClose notifications
     */
    onDidCloseTextDocument(
        handler: NotificationHandler<
            import('vscode-languageserver-protocol').DidCloseTextDocumentParams
        >,
    ): Subscription {
        return this.onNotification(
            DidCloseTextDocumentNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to textDocument/didSave notifications
     */
    onDidSaveTextDocument(
        handler: NotificationHandler<
            import('vscode-languageserver-protocol').DidSaveTextDocumentParams
        >,
    ): Subscription {
        return this.onNotification(
            DidSaveTextDocumentNotification.type,
            handler,
        );
    }

    // === Management Methods ===

    /**
     * Get current subscription statistics
     */
    getStats(): SubscriptionStats {
        return { ...this.stats };
    }

    /**
     * Get all active subscriptions
     */
    getActiveSubscriptions(): Array<{
        id: string;
        method: string;
        age: number;
    }> {
        const now = Date.now();
        return Array.from(this.subscriptions.values()).map((entry) => ({
            id: entry.id,
            method: entry.method,
            age: now - entry.createdAt,
        }));
    }

    /**
     * Get subscriptions for a specific method
     */
    getSubscriptionsForMethod(method: string): string[] {
        return Array.from(this.subscriptionsByMethod.get(method) || []);
    }

    /**
     * Unsubscribe all handlers for a specific method
     */
    unsubscribeMethod(method: string): number {
        const subscriptionIds = this.getSubscriptionsForMethod(method);
        let count = 0;

        for (const id of subscriptionIds) {
            if (this.unsubscribe(id)) {
                count++;
            }
        }

        this.log(`Unsubscribed ${count} handlers for method ${method}`);
        return count;
    }

    /**
     * Subscribe to subscription metrics
     */
    onMetrics(handler: (metrics: NotificationMetrics) => void): Subscription {
        this.metricsHandlers.add(handler);
        return createSubscription(
            () => this.metricsHandlers.delete(handler),
            'subscription-metrics-handler',
        );
    }

    /**
     * Subscribe to statistics updates
     */
    onStats(handler: (stats: SubscriptionStats) => void): Subscription {
        this.statsHandlers.add(handler);
        return createSubscription(
            () => this.statsHandlers.delete(handler),
            'subscription-stats-handler',
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

        this.log(
            `Disposing SubscriptionManager with ${this.subscriptions.size} active subscriptions`,
        );

        // Dispose all subscriptions
        for (const entry of this.subscriptions.values()) {
            try {
                entry.microsoftDisposable.dispose();
            } catch (error) {
                this.log(`Error disposing subscription ${entry.id}: ${error}`);
            }
        }

        this.subscriptions.clear();
        this.subscriptionsByMethod.clear();

        // Dispose other resources
        this.disposables.dispose();
        this.metricsHandlers.clear();
        this.statsHandlers.clear();

        this.log('SubscriptionManager disposed');
    }

    // === Private Methods ===

    /**
     * Create a wrapped handler with monitoring and error handling
     */
    private createWrappedHandler<P>(
        method: string,
        handler: NotificationHandler<P>,
    ): (params: P) => void | Promise<void> {
        return async (params: P) => {
            const startTime = Date.now();
            let success = true;
            let error: string | undefined;

            try {
                this.stats.notificationsReceived++;
                this.stats.lastActivity = Date.now();

                // Call the original handler
                const result = handler(params);

                // Handle both sync and async handlers
                if (result instanceof Promise) {
                    await result;
                }

                this.log(`Notification ${method} handled successfully`);
            } catch (handlerError) {
                success = false;
                error =
                    handlerError instanceof Error
                        ? handlerError.message
                        : String(handlerError);
                this.stats.errorCount++;

                this.log(
                    `Error in notification handler for ${method}: ${error}`,
                );

                // Don't rethrow - we don't want to break the LSP connection
                // Just log the error for debugging
            } finally {
                const processingTime = Date.now() - startTime;

                if (this.enableMonitoring) {
                    this.emitMetrics({
                        method,
                        timestamp: Date.now(),
                        handlerCount:
                            this.getSubscriptionsForMethod(method).length,
                        processingTime,
                        success,
                        error,
                    });
                }
            }
        };
    }

    /**
     * Unsubscribe a specific subscription
     */
    private unsubscribe(subscriptionId: string): boolean {
        const entry = this.subscriptions.get(subscriptionId);
        if (!entry) {
            return false;
        }

        this.log(`Unsubscribing ${entry.method} (id: ${subscriptionId})`);

        // Dispose Microsoft subscription
        try {
            entry.microsoftDisposable.dispose();
        } catch (error) {
            this.log(`Error disposing Microsoft subscription: ${error}`);
        }

        // Remove from tracking
        this.subscriptions.delete(subscriptionId);
        this.untrackSubscriptionByMethod(entry.method, subscriptionId);
        this.updateStats('unsubscribe', entry.method);

        return true;
    }

    /**
     * Track subscription by method
     */
    private trackSubscriptionByMethod(
        method: string,
        subscriptionId: string,
    ): void {
        if (!this.subscriptionsByMethod.has(method)) {
            this.subscriptionsByMethod.set(method, new Set());
        }
        this.subscriptionsByMethod.get(method)!.add(subscriptionId);
    }

    /**
     * Untrack subscription by method
     */
    private untrackSubscriptionByMethod(
        method: string,
        subscriptionId: string,
    ): void {
        const methodSubs = this.subscriptionsByMethod.get(method);
        if (methodSubs) {
            methodSubs.delete(subscriptionId);
            if (methodSubs.size === 0) {
                this.subscriptionsByMethod.delete(method);
            }
        }
    }

    /**
     * Check subscription limits
     */
    private checkSubscriptionLimits(method: string): void {
        const currentCount = this.subscriptionsByMethod.get(method)?.size || 0;
        if (currentCount >= this.maxSubscriptionsPerMethod) {
            throw new Error(
                `Maximum subscriptions per method exceeded for ${method} (${currentCount}/${this.maxSubscriptionsPerMethod})`,
            );
        }
    }

    /**
     * Generate unique subscription ID
     */
    private generateSubscriptionId(): string {
        return `sub_${++this.subscriptionCounter}_${Date.now()}`;
    }

    /**
     * Update statistics
     */
    private updateStats(
        event: 'subscribe' | 'unsubscribe',
        method: string,
    ): void {
        switch (event) {
            case 'subscribe':
                this.stats.totalSubscriptions++;
                this.stats.activeSubscriptions++;
                this.stats.subscriptionsByMethod[method] =
                    (this.stats.subscriptionsByMethod[method] || 0) + 1;
                break;
            case 'unsubscribe':
                this.stats.activeSubscriptions--;
                if (this.stats.subscriptionsByMethod[method] > 0) {
                    this.stats.subscriptionsByMethod[method]--;
                }
                break;
        }
    }

    /**
     * Emit metrics to handlers
     */
    private emitMetrics(metrics: NotificationMetrics): void {
        for (const handler of this.metricsHandlers) {
            try {
                handler(metrics);
            } catch (error) {
                this.log(`Error in metrics handler: ${error}`);
            }
        }
    }

    /**
     * Setup monitoring interval
     */
    private setupMonitoring(): void {
        const statsInterval = setInterval(() => {
            this.emitStats();
        }, 5000); // Every 5 seconds

        this.disposables.add(
            createSubscription(
                () => clearInterval(statsInterval),
                'stats-monitoring-interval',
            ),
        );
    }

    /**
     * Emit statistics to handlers
     */
    private emitStats(): void {
        for (const handler of this.statsHandlers) {
            try {
                handler(this.getStats());
            } catch (error) {
                this.log(`Error in stats handler: ${error}`);
            }
        }
    }

    /**
     * Debug logging
     */
    private log(message: string, ...args: any[]): void {
        if (this.debug) {
            this.logger(`[SubscriptionManager] ${message}`, ...args);
        }
    }
}
