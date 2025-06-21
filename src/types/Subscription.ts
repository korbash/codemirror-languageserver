/**
 * RAII-style subscription management for LSP event handlers.
 * Provides automatic cleanup and prevents memory leaks.
 *
 * Integrates with Microsoft's Disposable pattern while adding
 * Zed-style automatic resource management.
 */

import { Disposable } from 'vscode-languageserver-protocol';

/**
 * Subscription state tracking
 */
enum SubscriptionState {
    Active = 'active',
    Disposed = 'disposed',
    Detached = 'detached',
}

/**
 * RAII-style subscription with automatic cleanup
 */
export class Subscription implements Disposable {
    private state: SubscriptionState = SubscriptionState.Active;

    constructor(
        private readonly cleanup: () => void,
        private readonly resource: string,
        private readonly method?: string,
    ) {}

    /**
     * Check if subscription is still active
     */
    get isActive(): boolean {
        return this.state === SubscriptionState.Active;
    }

    /**
     * Check if subscription is disposed
     */
    get isDisposed(): boolean {
        return this.state === SubscriptionState.Disposed;
    }

    /**
     * Check if subscription is detached
     */
    get isDetached(): boolean {
        return this.state === SubscriptionState.Detached;
    }

    /**
     * Get resource identifier
     */
    get resourceId(): string {
        return this.resource;
    }

    /**
     * Get method name (for LSP method subscriptions)
     */
    get methodName(): string | undefined {
        return this.method;
    }

    /**
     * Dispose the subscription (Microsoft Disposable interface)
     */
    dispose(): void {
        if (this.state === SubscriptionState.Active) {
            this.state = SubscriptionState.Disposed;
            try {
                this.cleanup();
            } catch (error) {
                console.error(
                    `Error disposing subscription ${this.resource}:`,
                    error,
                );
            }
        }
    }

    /**
     * Detach subscription without disposing (Zed-style)
     * Prevents automatic cleanup but keeps subscription alive
     */
    detach(): void {
        if (this.state === SubscriptionState.Active) {
            this.state = SubscriptionState.Detached;
        }
    }

    /**
     * TC39 Symbol.dispose support for automatic cleanup
     * Enables `using` declarations in TypeScript 5.2+
     */
    [Symbol.dispose](): void {
        this.dispose();
    }

    /**
     * String representation for debugging
     */
    toString(): string {
        return `Subscription(${this.resource}, state: ${this.state}, method: ${this.method || 'none'})`;
    }
}

/**
 * Composite subscription that manages multiple subscriptions
 */
export class CompositeSubscription implements Disposable {
    private readonly subscriptions = new Set<Subscription>();
    private disposed = false;

    /**
     * Add a subscription to the composite
     */
    add(subscription: Subscription): void {
        if (this.disposed) {
            subscription.dispose();
            return;
        }
        this.subscriptions.add(subscription);
    }

    /**
     * Remove a subscription from the composite
     */
    remove(subscription: Subscription): boolean {
        return this.subscriptions.delete(subscription);
    }

    /**
     * Get number of active subscriptions
     */
    get size(): number {
        return this.subscriptions.size;
    }

    /**
     * Check if composite is disposed
     */
    get isDisposed(): boolean {
        return this.disposed;
    }

    /**
     * Dispose all subscriptions
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        const errors: Error[] = [];

        for (const subscription of this.subscriptions) {
            try {
                subscription.dispose();
            } catch (error) {
                errors.push(
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        }

        this.subscriptions.clear();

        if (errors.length > 0) {
            console.error(
                'Errors occurred while disposing composite subscription:',
                errors,
            );
        }
    }

    /**
     * TC39 Symbol.dispose support
     */
    [Symbol.dispose](): void {
        this.dispose();
    }

    /**
     * Detach all subscriptions without disposing them
     */
    detachAll(): void {
        for (const subscription of this.subscriptions) {
            subscription.detach();
        }
        this.subscriptions.clear();
    }

    /**
     * Get all active subscriptions
     */
    getActive(): Subscription[] {
        return Array.from(this.subscriptions).filter((sub) => sub.isActive);
    }

    /**
     * Get subscriptions for a specific method
     */
    getByMethod(method: string): Subscription[] {
        return Array.from(this.subscriptions).filter(
            (sub) => sub.methodName === method,
        );
    }
}

/**
 * Utility function to create a subscription
 */
export function createSubscription(
    cleanup: () => void,
    resource: string,
    method?: string,
): Subscription {
    return new Subscription(cleanup, resource, method);
}

/**
 * Utility function to create a composite subscription
 */
export function createCompositeSubscription(): CompositeSubscription {
    return new CompositeSubscription();
}

/**
 * Type for subscription factory functions
 */
export type SubscriptionFactory<T> = (handler: T) => Subscription;

/**
 * Helper to wrap Microsoft Disposable as our Subscription
 */
export function wrapDisposable(
    disposable: Disposable,
    resource: string,
    method?: string,
): Subscription {
    return new Subscription(() => disposable.dispose(), resource, method);
}

/**
 * Resource tracking for debugging and monitoring
 */
export class SubscriptionTracker {
    private static instance?: SubscriptionTracker;
    private readonly activeSubscriptions = new Map<string, Subscription[]>();

    static getInstance(): SubscriptionTracker {
        if (!SubscriptionTracker.instance) {
            SubscriptionTracker.instance = new SubscriptionTracker();
        }
        return SubscriptionTracker.instance;
    }

    track(subscription: Subscription): void {
        const resource = subscription.resourceId;
        if (!this.activeSubscriptions.has(resource)) {
            this.activeSubscriptions.set(resource, []);
        }
        this.activeSubscriptions.get(resource)!.push(subscription);
    }

    untrack(subscription: Subscription): void {
        const resource = subscription.resourceId;
        const subscriptions = this.activeSubscriptions.get(resource);
        if (subscriptions) {
            const index = subscriptions.indexOf(subscription);
            if (index >= 0) {
                subscriptions.splice(index, 1);
            }
            if (subscriptions.length === 0) {
                this.activeSubscriptions.delete(resource);
            }
        }
    }

    getActiveCount(): number {
        return Array.from(this.activeSubscriptions.values()).reduce(
            (total, subs) => total + subs.length,
            0,
        );
    }

    getResourceCount(): number {
        return this.activeSubscriptions.size;
    }

    getReport(): Record<string, number> {
        const report: Record<string, number> = {};
        for (const [resource, subscriptions] of this.activeSubscriptions) {
            report[resource] = subscriptions.length;
        }
        return report;
    }
}
