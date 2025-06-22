/**
 * Main LanguageServer class combining Microsoft LSP infrastructure with Zed architecture.
 *
 * This class provides a high-level API for LSP operations while leveraging
 * Microsoft's proven vscode-languageserver-protocol implementation underneath.
 * It adds Zed-style improvements for better error handling, resource management,
 * and developer experience.
 */

import {
    InitializeParams,
    InitializeResult,
    ServerCapabilities,
    ClientCapabilities,
    CompletionParams,
    CompletionList,
    CompletionItem,
    HoverParams,
    Hover,
    DefinitionParams,
    Definition,
    ReferenceParams,
    Location,
    DocumentSymbolParams,
    DocumentSymbol,
    SymbolInformation,
    DidOpenTextDocumentParams,
    DidChangeTextDocumentParams,
    DidCloseTextDocumentParams,
    DidSaveTextDocumentParams,
    PublishDiagnosticsParams,
    ShowMessageParams,
    LogMessageParams,
    InitializeRequest,
    CompletionRequest,
    HoverRequest,
    DefinitionRequest,
    ReferencesRequest,
    DocumentSymbolRequest,
    DidOpenTextDocumentNotification,
    DidChangeTextDocumentNotification,
    DidCloseTextDocumentNotification,
    DidSaveTextDocumentNotification,
    PublishDiagnosticsNotification,
    ShowMessageNotification,
    LogMessageNotification,
    ResponseError,
    ErrorCodes,
} from 'vscode-languageserver-protocol';

import { Result, Ok, Err, AsyncResult } from 'ts-results-es';
import { LSPError } from '../types/ErrorConverter.js';
import { Connection } from 'vscode-languageserver';

import {
    ConnectionManager,
    ConnectionManagerOptions,
} from './ConnectionManager.js';
import { RequestManager } from './RequestManager.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import {
    Subscription,
    CompositeSubscription,
    createSubscription,
    ServerState,
    LanguageServerOptions,
    RequestOptions,
    NotificationHandler,
    LSPMethod,
    ExtractParams,
    ExtractResult,
    LSPNotificationMethod,
    ExtractNotificationParams,
    LSPMethods,
    LSPMethodValue,
} from '../types/index.js';

/**
 * Main LanguageServer client with Zed architecture and Microsoft LSP integration
 */
export class LanguageServer implements Disposable {
    // Core components
    private readonly connectionManager: ConnectionManager;
    private requestManager?: RequestManager;
    private readonly subscriptionManager: SubscriptionManager;
    private readonly subscriptions: Disposable[] = [];

    // State
    private connection?: Connection;
    private state = ServerState.Initial;
    private capabilities?: ServerCapabilities;
    private disposed = false;

    // Events
    private readonly stateChangeHandlers = new Set<
        (state: ServerState) => void
    >();
    private readonly capabilitiesChangeHandlers = new Set<
        (capabilities: ServerCapabilities) => void
    >();
    private readonly errorHandlers = new Set<(error: Error) => void>();

    constructor(
        serverUri: string,
        private readonly options: LanguageServerOptions,
    ) {
        // Create connection manager with our options
        const connectionOptions: ConnectionManagerOptions = {
            wsUrl: serverUri,
            connectionTimeout: 10000,
            reconnectOptions: {
                enabled: true,
                maxAttempts: this.options.connection?.reconnectAttempts ?? 3,
                initialDelay: this.options.connection?.reconnectDelay ?? 1000,
                maxDelay: 30000,
                backoffMultiplier: 1.5,
            },
        };

        this.connectionManager = new ConnectionManager(connectionOptions);
        this.subscriptionManager = new SubscriptionManager();

        this.setupConnectionManagerHandlers();
    }

    // === Lifecycle Methods ===

    /**
     * Initialize the language server
     */
    initialize(
        params?: Partial<InitializeParams>,
    ): AsyncResult<InitializeResult, LSPError[]> {
        if (this.state !== ServerState.Initial) {
            return new AsyncResult(
                Err([
                    new LSPError(
                        `Cannot initialize server in state: ${this.state}`,
                        ErrorCodes.InternalError,
                        'initialize',
                    ),
                ]),
            );
        }

        const initPromise = (async () => {
            try {
                this.setState(ServerState.Connecting);

                // Create Microsoft Connection
                const connectionResult =
                    await this.connectionManager.connect().promise;
                if (connectionResult.isErr()) {
                    throw (
                        connectionResult.error[0] ||
                        new LSPError(
                            'Failed to establish connection',
                            ErrorCodes.InternalError,
                            'initialize',
                        )
                    );
                }

                this.connection = connectionResult.unwrap();

                // Setup managers with the connection
                this.requestManager = new RequestManager(this.connection);
                this.subscriptionManager.setConnection(this.connection);

                // Setup built-in handlers
                this.setupBuiltinNotificationHandlers();

                this.setState(ServerState.Initializing);

                // Send initialize request with default client capabilities
                const initParams: InitializeParams = {
                    processId: null,
                    rootUri: this.options.rootUri,
                    capabilities: this.createDefaultClientCapabilities(),
                    initializationOptions: this.options.initializationOptions,
                    workspaceFolders: this.options.workspaceFolders?.map(
                        (uri: string) => ({
                            uri,
                            name: uri.split('/').pop() || 'workspace',
                        }),
                    ),
                    ...params,
                };

                const result = await this.requestManager.sendRequest(
                    LSPMethods.INITIALIZE,
                    initParams,
                    {
                        timeout: 30000,
                    },
                ).promise;

                if (result.isOk()) {
                    const initResult = result.unwrap() as InitializeResult;
                    this.capabilities = initResult.capabilities;
                    this.setState(ServerState.Running);
                    this.emitCapabilitiesChange(initResult.capabilities);
                    this.log(
                        'info',
                        'Language server initialized successfully',
                    );
                    return Ok(initResult);
                } else {
                    this.setState(ServerState.Error);
                    return result;
                }
            } catch (error) {
                const lspError =
                    error instanceof LSPError
                        ? error
                        : new LSPError(
                              error instanceof Error
                                  ? error.message
                                  : String(error),
                              ErrorCodes.InternalError,
                              'initialize',
                          );
                this.setState(ServerState.Error);
                return Err([lspError]);
            }
        })();

        return new AsyncResult(initPromise);
    }

    /**
     * Shutdown the language server connection
     */
    shutdown(): AsyncResult<void, LSPError[]> {
        if (
            this.state === ServerState.Stopped ||
            this.state === ServerState.Stopping
        ) {
            return new AsyncResult(Ok(undefined));
        }

        this.setState(ServerState.Stopping);

        return this.connectionManager.close().map(() => {
            this.setState(ServerState.Stopped);
            return undefined;
        });
    }

    // === Typed LSP Request Methods ===

    /**
     * Send completion request
     */
    completion(
        params: CompletionParams,
        options?: RequestOptions,
    ): AsyncResult<CompletionList | CompletionItem[] | null, LSPError[]> {
        if (!this.requestManager) {
            return new AsyncResult(
                Err([
                    new LSPError(
                        'Server not initialized',
                        ErrorCodes.ServerNotInitialized,
                        'completion',
                    ),
                ]),
            );
        }
        return this.requestManager.sendRequest(
            LSPMethods.TEXTDOCUMENT_COMPLETION,
            params,
            options,
        );
    }

    /**
     * Send hover request
     */
    hover(
        params: HoverParams,
        options?: RequestOptions,
    ): AsyncResult<Hover | null, LSPError[]> {
        if (!this.requestManager) {
            return new AsyncResult(
                Err([
                    new LSPError(
                        'Server not initialized',
                        ErrorCodes.ServerNotInitialized,
                        'hover',
                    ),
                ]),
            );
        }
        return this.requestManager.sendRequest(
            LSPMethods.TEXTDOCUMENT_HOVER,
            params,
            options,
        );
    }

    /**
     * Send definition request
     */
    definition(
        params: DefinitionParams,
        options?: RequestOptions,
    ): AsyncResult<
        | Definition
        | import('vscode-languageserver-protocol').LocationLink[]
        | null,
        LSPError[]
    > {
        if (!this.requestManager) {
            return new AsyncResult(
                Err([
                    new LSPError(
                        'Server not initialized',
                        ErrorCodes.ServerNotInitialized,
                        'definition',
                    ),
                ]),
            );
        }
        return this.requestManager.sendRequest(
            LSPMethods.TEXTDOCUMENT_DEFINITION,
            params,
            options,
        );
    }

    /**
     * Send references request
     */
    references(
        params: ReferenceParams,
        options?: RequestOptions,
    ): AsyncResult<Location[] | null, LSPError[]> {
        if (!this.requestManager) {
            return new AsyncResult(
                Err([
                    new LSPError(
                        'Server not initialized',
                        ErrorCodes.ServerNotInitialized,
                        'references',
                    ),
                ]),
            );
        }
        return this.requestManager.sendRequest(
            LSPMethods.TEXTDOCUMENT_REFERENCES,
            params,
            options,
        );
    }

    /**
     * Send document symbol request
     */
    documentSymbol(
        params: DocumentSymbolParams,
        options?: RequestOptions,
    ): AsyncResult<DocumentSymbol[] | SymbolInformation[] | null, LSPError[]> {
        if (!this.requestManager) {
            return new AsyncResult(
                Err([
                    new LSPError(
                        'Server not initialized',
                        ErrorCodes.ServerNotInitialized,
                        'documentSymbol',
                    ),
                ]),
            );
        }
        return this.requestManager.sendRequest(
            LSPMethods.TEXTDOCUMENT_DOCUMENTSYMBOL,
            params,
            options,
        );
    }

    /**
     * Generic typed request method
     */
    request<K extends LSPMethod>(
        method: K,
        params: ExtractParams<K>,
        options?: RequestOptions,
    ): AsyncResult<ExtractResult<K>, LSPError[]> {
        if (!this.connection) {
            return new AsyncResult(
                Err([
                    new LSPError(
                        'No active connection',
                        ErrorCodes.InternalError,
                        method,
                    ),
                ]),
            );
        }
        if (!this.requestManager) {
            return new AsyncResult(
                Err([
                    new LSPError(
                        'Server not initialized',
                        ErrorCodes.ServerNotInitialized,
                        method,
                    ),
                ]),
            );
        }
        return this.requestManager.sendRequest(method, params, options);
    }

    // === LSP Notification Methods ===

    /**
     * Send textDocument/didOpen notification
     */
    async notifyDidOpenTextDocument(
        params: DidOpenTextDocumentParams,
    ): Promise<void> {
        return this.sendNotification(
            DidOpenTextDocumentNotification.type,
            params,
        );
    }

    /**
     * Send textDocument/didChange notification
     */
    async notifyDidChangeTextDocument(
        params: DidChangeTextDocumentParams,
    ): Promise<void> {
        return this.sendNotification(
            DidChangeTextDocumentNotification.type,
            params,
        );
    }

    /**
     * Send textDocument/didClose notification
     */
    async notifyDidCloseTextDocument(
        params: DidCloseTextDocumentParams,
    ): Promise<void> {
        return this.sendNotification(
            DidCloseTextDocumentNotification.type,
            params,
        );
    }

    /**
     * Send textDocument/didSave notification
     */
    async notifyDidSaveTextDocument(
        params: DidSaveTextDocumentParams,
    ): Promise<void> {
        return this.sendNotification(
            DidSaveTextDocumentNotification.type,
            params,
        );
    }

    /**
     * Generic notification sender
     */
    async sendNotification<T>(
        notificationType: { method: string },
        params: T,
    ): Promise<void> {
        if (!this.connection) {
            throw new LSPError(
                'No active connection',
                ErrorCodes.InternalError,
                notificationType.method,
            );
        }

        return this.connection.sendNotification(
            notificationType.method,
            params,
        );
    }

    // === Event Subscription Methods (Zed-style) ===

    /**
     * Subscribe to diagnostics notifications
     */
    onDiagnostics(
        handler: NotificationHandler<PublishDiagnosticsParams>,
    ): Subscription {
        return this.subscriptionManager.onNotification(
            PublishDiagnosticsNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to show message notifications
     */
    onShowMessage(
        handler: NotificationHandler<ShowMessageParams>,
    ): Subscription {
        return this.subscriptionManager.onNotification(
            ShowMessageNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to log message notifications
     */
    onLogMessage(handler: NotificationHandler<LogMessageParams>): Subscription {
        return this.subscriptionManager.onNotification(
            LogMessageNotification.type,
            handler,
        );
    }

    /**
     * Subscribe to progress notifications
     */
    onProgress(handler: NotificationHandler<any>): Subscription {
        // Create a custom notification type for progress since it may not be exported
        const progressNotificationType = { method: '$/progress' } as any;
        return this.subscriptionManager.onNotification(
            progressNotificationType,
            handler,
        );
    }

    /**
     * Generic typed notification subscription
     */
    onNotification<K extends LSPNotificationMethod>(
        method: K,
        handler: NotificationHandler<ExtractNotificationParams<K>>,
    ): Subscription {
        return this.subscriptionManager.onNotification(
            { method } as any,
            handler,
        );
    }

    // === State and Capabilities ===

    /**
     * Get current server state
     */
    getState(): ServerState {
        return this.state;
    }

    /**
     * Get server capabilities (available after initialization)
     */
    getCapabilities(): ServerCapabilities | undefined {
        return this.capabilities;
    }

    /**
     * Check if server is ready for requests
     */
    isReady(): boolean {
        return (
            this.state === ServerState.Running && this.connection !== undefined
        );
    }

    /**
     * Subscribe to state changes
     */
    onStateChange(handler: (state: ServerState) => void): Subscription {
        this.stateChangeHandlers.add(handler);
        return createSubscription(
            () => this.stateChangeHandlers.delete(handler),
            'state-change-handler',
        );
    }

    /**
     * Subscribe to capabilities changes
     */
    onCapabilitiesChange(
        handler: (capabilities: ServerCapabilities) => void,
    ): Subscription {
        this.capabilitiesChangeHandlers.add(handler);
        return createSubscription(
            () => this.capabilitiesChangeHandlers.delete(handler),
            'capabilities-change-handler',
        );
    }

    /**
     * Subscribe to errors
     */
    onError(handler: (error: Error) => void): Subscription {
        this.errorHandlers.add(handler);
        return createSubscription(
            () => this.errorHandlers.delete(handler),
            'error-handler',
        );
    }

    // === Microsoft Disposable Interface ===

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.setState(ServerState.Stopped);

        // Dispose all subscriptions
        this.subscriptions.forEach((sub) => {
            try {
                if ('dispose' in sub && typeof sub.dispose === 'function') {
                    sub.dispose();
                } else if (Symbol.dispose in sub) {
                    sub[Symbol.dispose]();
                }
            } catch (error) {
                // Ignore disposal errors
            }
        });
        this.subscriptions.length = 0;

        // Dispose managers
        this.subscriptionManager.dispose();
        this.connectionManager.dispose();

        // Clear event handlers
        this.stateChangeHandlers.clear();
        this.capabilitiesChangeHandlers.clear();
        this.errorHandlers.clear();

        this.log('info', 'LanguageServer disposed');
    }

    // === TC39 Symbol.dispose support ===

    [Symbol.dispose](): void {
        this.dispose();
    }

    // === Factory Methods ===

    /**
     * Create a LanguageServer instance
     */
    static async create(
        serverUri: string,
        options: LanguageServerOptions,
    ): Promise<LanguageServer> {
        const server = new LanguageServer(serverUri, options);
        return server;
    }

    /**
     * Create and initialize a LanguageServer instance
     */
    static createAndInitialize(
        serverUri: string,
        options: LanguageServerOptions,
        initParams?: Partial<InitializeParams>,
    ): AsyncResult<LanguageServer, LSPError[]> {
        const server = new LanguageServer(serverUri, options);
        return server
            .initialize(initParams)
            .map(() => server)
            .mapErr((errors: LSPError[]) => {
                // Failed - dispose server and return errors from initialization
                server.dispose();
                return errors.length > 0
                    ? errors
                    : [
                          new LSPError(
                              'Unknown initialization error',
                              ErrorCodes.InternalError,
                              'createAndInitialize',
                          ),
                      ];
            });
    }

    // === Private Methods ===

    private setupConnectionManagerHandlers(): void {
        // Handle connection state changes
        const stateChangeResult = this.connectionManager.onStateChange(
            (state) => {
                this.setState(state);
            },
        );

        this.subscriptions.push({
            dispose: () => stateChangeResult.dispose(),
            [Symbol.dispose]: () => stateChangeResult.dispose(),
        } as any);

        // Handle connection errors
        const errorResult = this.connectionManager.onError((error) => {
            this.emitError(error);
        });

        this.subscriptions.push({
            dispose: () => errorResult.dispose(),
            [Symbol.dispose]: () => errorResult.dispose(),
        } as any);
    }

    private setupBuiltinNotificationHandlers(): void {
        // Setup handlers for common LSP notifications that might need special handling
        // Most notifications will be handled via the subscription system
    }

    private createDefaultClientCapabilities(): ClientCapabilities {
        return {
            workspace: {
                configuration: true,
                didChangeWatchedFiles: {
                    dynamicRegistration: true,
                },
                workspaceFolders: true,
                applyEdit: true,
            },
            textDocument: {
                synchronization: {
                    didSave: true,
                    dynamicRegistration: true,
                },
                completion: {
                    completionItem: {
                        snippetSupport: true,
                        resolveSupport: {
                            properties: [
                                'documentation',
                                'detail',
                                'additionalTextEdits',
                            ],
                        },
                    },
                    contextSupport: true,
                },
                hover: {
                    contentFormat: ['markdown', 'plaintext'],
                },
                definition: {
                    linkSupport: true,
                },
                references: {},
                documentSymbol: {
                    hierarchicalDocumentSymbolSupport: true,
                },
                publishDiagnostics: {
                    relatedInformation: true,
                    tagSupport: {
                        valueSet: [1, 2], // Unnecessary and Deprecated
                    },
                },
            },
        };
    }

    private setState(state: ServerState): void {
        if (this.state === state) {
            return;
        }

        const oldState = this.state;
        this.state = state;

        this.log('info', `State changed: ${oldState} -> ${state}`);

        for (const handler of this.stateChangeHandlers) {
            try {
                handler(state);
            } catch (error) {
                this.log('error', `Error in state change handler: ${error}`);
            }
        }
    }

    private emitCapabilitiesChange(capabilities: ServerCapabilities): void {
        for (const handler of this.capabilitiesChangeHandlers) {
            try {
                handler(capabilities);
            } catch (error) {
                this.log(
                    'error',
                    `Error in capabilities change handler: ${error}`,
                );
            }
        }
    }

    private emitError(error: Error): void {
        for (const handler of this.errorHandlers) {
            try {
                handler(error);
            } catch (error) {
                this.log('error', `Error in error handler: ${error}`);
            }
        }
    }

    private log(level: string, message: string, ...args: any[]): void {
        const shouldLog =
            this.options.logging?.level === 'debug' ||
            this.options.logging?.level === 'trace' ||
            level === 'error';

        if (shouldLog) {
            const prefix = this.options.logging?.prefix
                ? `[${this.options.logging.prefix}] `
                : '[LanguageServer] ';
            const logMethod = (console as any)[level];
            if (typeof logMethod === 'function') {
                logMethod(prefix + message, ...args);
            } else {
                console.log(
                    `${prefix}${level.toUpperCase()}: ${message}`,
                    ...args,
                );
            }
        }
    }
}
