import * as LSP from 'vscode-languageserver-protocol';
import { RequestManager, Client } from '@open-rpc/client-js';
import {
    LSPRequestMap,
    LSPNotifyMap,
    Notification,
    LanguageServerClientOptions,
} from '../types/lsp';
import { createLogger, logAsyncMethodCall } from '../utils/logger';
import { globalAbortManager, throwIfAborted } from '../utils/abort';
import { RequestCancellation } from './RequestCancellation';

/**
 * Client states following Microsoft LSP client pattern
 */
export enum ClientState {
    Initial = 'initial',
    Starting = 'starting',
    StartFailed = 'startFailed',
    Running = 'running',
    Stopping = 'stopping',
    Stopped = 'stopped'
}

/**
 * Public state enum for external consumers
 */
export enum State {
    Stopped = 1,
    Starting = 3,
    StartFailed = 4,
    Running = 2,
}

/**
 * State change event
 */
export interface StateChangeEvent {
    oldState: State;
    newState: State;
}

/**
 * Error action enum
 */
export enum ErrorAction {
    Continue = 1,
    Shutdown = 2
}

/**
 * Close action enum
 */
export enum CloseAction {
    DoNotRestart = 1,
    Restart = 2,
}

/**
 * Error handler result
 */
export type ErrorHandlerResult = {
    action: ErrorAction;
    message?: string;
    handled?: boolean;
};

/**
 * Close handler result
 */
export type CloseHandlerResult = {
    action: CloseAction;
    message?: string;
    handled?: boolean;
};

/**
 * Error handler interface
 */
export interface ErrorHandler {
    error(error: Error, message: any | undefined, count: number | undefined): ErrorHandlerResult | Promise<ErrorHandlerResult>;
    closed(): CloseHandlerResult | Promise<CloseHandlerResult>;
}

/**
 * Middleware for intercepting requests and notifications
 */
export interface Middleware {
    sendRequest?<P, R>(
        method: string,
        param: P | undefined,
        abortSignal: AbortSignal | undefined,
        next: (method: string, param?: P, abortSignal?: AbortSignal) => Promise<R>,
    ): Promise<R>;

    sendNotification?<P>(
        method: string,
        params: P,
        next: (method: string, params?: P) => Promise<void>,
    ): Promise<void>;

    handleDiagnostics?(
        uri: string,
        diagnostics: LSP.Diagnostic[],
        next: (uri: string, diagnostics: LSP.Diagnostic[]) => void,
    ): void;
}

/**
 * Simple semaphore implementation for controlling concurrency
 */
class Semaphore {
    private permits: number;
    private waitQueue: Array<() => void> = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this.permits > 0) {
                this.permits--;
                resolve();
            } else {
                this.waitQueue.push(resolve);
            }
        });
    }

    release(): void {
        this.permits++;
        if (this.waitQueue.length > 0) {
            const next = this.waitQueue.shift()!;
            this.permits--;
            next();
        }
    }

    async lock<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

/**
 * Event emitter implementation
 */
class EventEmitter<T> {
    private listeners: Array<(data: T) => void> = [];

    on(listener: (data: T) => void): () => void {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    fire(data: T): void {
        this.listeners.forEach(listener => {
            try {
                listener(data);
            } catch (error) {
                console.error('Error in event listener:', error);
            }
        });
    }

    dispose(): void {
        this.listeners = [];
    }
}

/**
 * Enhanced Language Server Client with Microsoft LSP best practices
 */
export class EnhancedLanguageServerClient<TInitOptions = unknown> {
    public capabilities: LSP.ServerCapabilities = {};
    public initializePromise: Promise<void> | undefined;

    private rootUri: string | null;
    private workspaceFolders: LSP.WorkspaceFolder[] | null;
    private autoClose: boolean = false;

    private transport: any;
    private requestManager: RequestManager;
    private client: Client;

    private plugins: any[] = [];
    private options: LanguageServerClientOptions<TInitOptions>;
    private logger = createLogger('ENHANCED_CLIENT');
    private requestCancellation: RequestCancellation;

    // State management
    private _state: ClientState = ClientState.Initial;
    private _stateChangeEmitter = new EventEmitter<StateChangeEvent>();

    // Error handling
    private errorHandler: ErrorHandler;

    // Middleware
    private middleware: Middleware;

    // Pending handlers (for pre-initialization registration)
    private pendingRequestHandlers = new Map<string, (params: any) => Promise<any>>();
    private pendingNotificationHandlers = new Map<string, (params: any) => void>();
    private activeRequestDisposables = new Map<string, () => void>();
    private activeNotificationDisposables = new Map<string, () => void>();

    // Document synchronization
    private documentSyncSemaphore = new Semaphore(1);
    private pendingDocumentChanges: Map<string, any> = new Map();

    // Connection management
    private _onStart: Promise<void> | undefined;
    private _onStop: Promise<void> | undefined;

    constructor(options: LanguageServerClientOptions<TInitOptions>) {
        this.logger.info('Creating EnhancedLanguageServerClient', {
            rootUri: options.rootUri,
            autoClose: options.autoClose,
            hasTransport: !!options.transport,
            workspaceFolders: options.workspaceFolders?.length || 0,
        });

        this.options = options;
        this.rootUri = options.rootUri;
        this.workspaceFolders = options.workspaceFolders;
        this.autoClose = options.autoClose || false;
        this.transport = options.transport;

        // Initialize middleware
        this.middleware = options.middleware || {};

        // Initialize error handler
        this.errorHandler = options.errorHandler || this.createDefaultErrorHandler();

        this.logger.debug('Creating RequestManager and Client');
        this.requestManager = new RequestManager([this.transport]);
        this.client = new Client(this.requestManager);

        // Initialize request cancellation system
        this.requestCancellation = new RequestCancellation((method, params) =>
            this.sendNotification(method, params),
        );

        this.client.onNotification((data) => {
            this.logger.trace('Received notification:', data);
            this.processNotification(data as any);
        });
    }

    /**
     * Get current client state
     */
    public get state(): State {
        return this.getPublicState();
    }

    /**
     * State change event
     */
    public get onDidChangeState(): (listener: (event: StateChangeEvent) => void) => () => void {
        return this._stateChangeEmitter.on.bind(this._stateChangeEmitter);
    }

    /**
     * Check if client is ready for requests
     */
    public get ready(): boolean {
        return this._state === ClientState.Running;
    }

    /**
     * Internal state setter with event emission
     */
    private set $state(value: ClientState) {
        const oldState = this.getPublicState();
        this._state = value;
        const newState = this.getPublicState();
        if (newState !== oldState) {
            this._stateChangeEmitter.fire({ oldState, newState });
        }
    }

    /**
     * Convert internal state to public state
     */
    private getPublicState(): State {
        switch (this._state) {
            case ClientState.Starting:
                return State.Starting;
            case ClientState.Running:
                return State.Running;
            case ClientState.StartFailed:
                return State.StartFailed;
            default:
                return State.Stopped;
        }
    }

    /**
     * Start the language server client
     */
    public async start(): Promise<void> {
        if (this._state === ClientState.Stopping) {
            throw new Error('Client is currently stopping. Can only restart a fully stopped client');
        }

        // If already running or starting, return existing promise
        if (this._onStart !== undefined) {
            return this._onStart;
        }

        const [promise, resolve, reject] = this.createPromiseHandlers<void>();
        this._onStart = promise;

        // Move pending handlers to active if connection exists
        this.activatePendingHandlers();

        this.$state = ClientState.Starting;

        try {
            await this.initialize();
            this.$state = ClientState.Running;
            resolve();
        } catch (error) {
            this.$state = ClientState.StartFailed;
            this.logger.error('Failed to start client', error);
            reject(error);
        }

        return this._onStart;
    }

    /**
     * Stop the language server client
     */
    public async stop(timeout: number = 2000): Promise<void> {
        if (this._state === ClientState.Stopped || this._state === ClientState.Initial) {
            return;
        }

        if (this._state === ClientState.Stopping) {
            if (this._onStop !== undefined) {
                return this._onStop;
            } else {
                throw new Error('Client is stopping but no stop promise available');
            }
        }

        this.$state = ClientState.Stopping;
        this.cleanUp();

        const timeoutPromise = new Promise<void>((resolve) => {
            setTimeout(resolve, timeout);
        });

        const shutdownPromise = this.performShutdown();

        return this._onStop = Promise.race([timeoutPromise, shutdownPromise]).then(() => {
            this.$state = ClientState.Stopped;
            this._onStart = undefined;
            this._onStop = undefined;
        }, (error) => {
            this.logger.error('Error during shutdown', error);
            this.$state = ClientState.Stopped;
            this._onStart = undefined;
            this._onStop = undefined;
            throw error;
        });
    }

    /**
     * Send a request with middleware support
     */
    public async sendRequest<TRequest extends keyof LSPRequestMap>(
        method: TRequest,
        params: LSPRequestMap[TRequest][0],
        abortSignal?: AbortSignal,
    ): Promise<LSPRequestMap[TRequest][1]>;
    public async sendRequest<T = any>(
        method: string,
        params?: any,
        abortSignal?: AbortSignal,
    ): Promise<T>;
    public async sendRequest<T = any>(
        method: string,
        params?: any,
        abortSignal?: AbortSignal,
    ): Promise<T> {
        // Ensure client is ready
        await this.ensureReady();

        const signal = globalAbortManager.createSignal(abortSignal);

        // Create cancellable request
        const pendingRequest = this.requestCancellation.createRequest(method, signal);

        try {
            // Apply middleware if available
            if (this.middleware.sendRequest) {
                return await this.middleware.sendRequest(
                    method,
                    params,
                    signal,
                    (method, params, signal) => this.doSendRequest(method, params, signal)
                );
            } else {
                return await this.doSendRequest(method, params, signal);
            }
        } catch (error) {
            this.requestCancellation.completeRequest(pendingRequest.id, false);
            if (RequestCancellation.isCancellationError(error)) {
                this.logger.debug('Request was cancelled', { method, id: pendingRequest.id });
            } else {
                this.logger.error('Request failed', { method, id: pendingRequest.id, error });
            }
            throw error;
        } finally {
            this.requestCancellation.completeRequest(pendingRequest.id, true);
        }
    }

    /**
     * Send a notification with middleware support
     */
    public async sendNotification<TNotify extends keyof LSPNotifyMap>(
        method: TNotify,
        params: LSPNotifyMap[TNotify],
    ): Promise<void>;
    public async sendNotification(method: string, params?: any): Promise<void>;
    public async sendNotification(method: string, params?: any): Promise<void> {
        // Ensure client is ready
        await this.ensureReady();

        // Apply middleware if available
        if (this.middleware.sendNotification) {
            return await this.middleware.sendNotification(
                method,
                params,
                (method, params) => this.doSendNotification(method, params)
            );
        } else {
            return await this.doSendNotification(method, params);
        }
    }

    /**
     * Register request handler (can be called before start)
     */
    public onRequest<TRequest extends keyof LSPRequestMap>(
        method: TRequest,
        handler: (params: LSPRequestMap[TRequest][0]) => Promise<LSPRequestMap[TRequest][1]>,
    ): () => void;
    public onRequest(method: string, handler: (params: any) => Promise<any>): () => void;
    public onRequest(method: string, handler: (params: any) => Promise<any>): () => void {
        // Store handler
        this.pendingRequestHandlers.set(method, handler);

        // If client is running, activate immediately
        if (this._state === ClientState.Running && this.client) {
            this.activateRequestHandler(method, handler);
        }

        // Return disposer
        return () => {
            this.pendingRequestHandlers.delete(method);
            const disposable = this.activeRequestDisposables.get(method);
            if (disposable) {
                disposable();
                this.activeRequestDisposables.delete(method);
            }
        };
    }

    /**
     * Register notification handler (can be called before start)
     */
    public onNotification<TNotify extends keyof LSPNotifyMap>(
        method: TNotify,
        handler: (params: LSPNotifyMap[TNotify]) => void,
    ): () => void;
    public onNotification(method: string, handler: (params: any) => void): () => void;
    public onNotification(method: string, handler: (params: any) => void): () => void {
        // Store handler
        this.pendingNotificationHandlers.set(method, handler);

        // If client is running, activate immediately
        if (this._state === ClientState.Running && this.client) {
            this.activateNotificationHandler(method, handler);
        }

        // Return disposer
        return () => {
            this.pendingNotificationHandlers.delete(method);
            const disposable = this.activeNotificationDisposables.get(method);
            if (disposable) {
                disposable();
                this.activeNotificationDisposables.delete(method);
            }
        };
    }

    /**
     * Document synchronization methods
     */
    public async textDocumentDidOpen(params: LSP.DidOpenTextDocumentParams): Promise<void> {
        return this.sendNotification('textDocument/didOpen', params);
    }

    public async textDocumentDidChange(params: LSP.DidChangeTextDocumentParams): Promise<void> {
        return this.documentSyncSemaphore.lock(async () => {
            // Store pending change
            this.pendingDocumentChanges.set(params.textDocument.uri, params);

            // Send notification
            return this.sendNotification('textDocument/didChange', params);
        });
    }

    public async textDocumentHover(
        params: LSP.HoverParams,
        abortSignal?: AbortSignal,
    ): Promise<LSP.Hover | null> {
        return this.sendRequest('textDocument/hover', params, abortSignal);
    }

    public async textDocumentCompletion(
        params: LSP.CompletionParams,
        abortSignal?: AbortSignal,
    ): Promise<LSP.CompletionItem[] | LSP.CompletionList | null> {
        return this.sendRequest('textDocument/completion', params, abortSignal);
    }

    /**
     * Cleanup and lifecycle management
     */
    public close(): void {
        this.stop().catch(error => {
            this.logger.error('Error during close', error);
        });
    }

    public getPendingRequests(): string[] {
        return this.requestCancellation.getPendingRequests();
    }

    public async cancelRequest(requestId: string, reason?: string): Promise<void> {
        return this.requestCancellation.cancelRequest(requestId, reason);
    }

    // Private methods

    private async ensureReady(): Promise<void> {
        if (this._state === ClientState.StartFailed || this._state === ClientState.Stopping || this._state === ClientState.Stopped) {
            throw new Error('Client is not running');
        }

        if (this._state !== ClientState.Running) {
            await this.start();
        }
    }

    private async
