import * as LSP from 'vscode-languageserver-protocol';
import { RequestManager, Client } from '@open-rpc/client-js';
import { Transport } from '@open-rpc/client-js/build/transports/Transport';
import {
    LSPRequestMap,
    LSPNotifyMap,
    Notification,
    LanguageServerClientOptions,
} from '../types/lsp';
import {
    createLogger,
    logAsyncMethodCall,
    logMethodCall,
} from '../utils/logger';
import {
    createAbortControllerWithTimeout,
    combineAbortSignals,
} from '../utils/abort';
import { RequestCancellation } from './RequestCancellation';

const timeout = 10000;

export class LanguageServerClient<TInitOptions = unknown> {
    public ready: boolean = false;
    public capabilities: LSP.ServerCapabilities = {};
    public initializePromise: Promise<void>;

    private rootUri: string | null;
    private workspaceFolders: LSP.WorkspaceFolder[] | null;
    private autoClose: boolean = false;

    private transport: any;
    private requestManager: RequestManager;
    private client: Client;

    private plugins: any[] = [];
    private options: LanguageServerClientOptions<TInitOptions>;
    private logger = createLogger('CLIENT');
    private abortSignal: AbortSignal | null = null;
    private requestCancellation: RequestCancellation;

    constructor(options: LanguageServerClientOptions<TInitOptions>) {
        this.logger.info('Creating LanguageServerClient', {
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
        this.abortSignal = options.abortSignal || null;

        this.logger.debug('Creating RequestManager and Client');
        this.requestManager = new RequestManager([this.transport]);
        this.client = new Client(this.requestManager);

        // Инициализируем систему отмены запросов
        this.requestCancellation = new RequestCancellation((method, params) =>
            this.sendNotification(method, params),
        );

        this.client.onNotification((data) => {
            this.logger.trace('Received notification:', data);
            this.processNotification(data as any);
        });

        // Handle WebSocket-specific logic if needed
        const webSocketTransport = this.transport as any;
        if (webSocketTransport && webSocketTransport.connection) {
            this.logger.debug('Setting up WebSocket transport event handlers');
            // XXX(hjr265): Need a better way to do this. Relevant issue:
            // https://github.com/FurqanSoftware/codemirror-languageserver/issues/9
            webSocketTransport.connection.addEventListener(
                'message',
                (message: MessageEvent) => {
                    this.logger.trace(
                        'WebSocket message received:',
                        message.data,
                    );
                    const data = JSON.parse(message.data);
                    if (data.method && data.id) {
                        this.logger.trace(
                            'Sending null response for method:',
                            data.method,
                        );
                        webSocketTransport.connection.send(
                            JSON.stringify({
                                jsonrpc: '2.0',
                                id: data.id,
                                result: null,
                            }),
                        );
                    }
                },
            );

            webSocketTransport.connection.addEventListener('open', () => {
                this.logger.info('WebSocket connection opened');
            });

            webSocketTransport.connection.addEventListener(
                'close',
                (event: CloseEvent) => {
                    this.logger.warn('WebSocket connection closed', {
                        code: event.code,
                        reason: event.reason,
                        wasClean: event.wasClean,
                    });
                },
            );

            webSocketTransport.connection.addEventListener(
                'error',
                (error: Event) => {
                    this.logger.error('WebSocket connection error:', error);
                },
            );
        }

        this.logger.debug('Starting initialization');
        this.initializePromise = this.initialize(this.abortSignal ?? undefined);
    }

    protected getInitializationOptions(): LSP.InitializeParams {
        return {
            processId: null,
            clientInfo: {
                name: 'codemirror-languageserver',
                version: '1.0.0',
            },
            rootUri: this.rootUri,
            initializationOptions: this.options.initializationOptions ?? null,
            capabilities: {
                general: {
                    regularExpressions: {
                        engine: 'ECMAScript',
                        version: 'ES2020',
                    },
                    markdown: {
                        parser: 'marked',
                        version: '4.0.10',
                    },
                },
                textDocument: {
                    synchronization: {
                        dynamicRegistration: false,
                        willSave: false,
                        willSaveWaitUntil: false,
                        didSave: false,
                    },
                    completion: {
                        dynamicRegistration: false,
                        completionItem: {
                            snippetSupport: false,
                            commitCharactersSupport: false,
                            documentationFormat: ['markdown', 'plaintext'],
                            deprecatedSupport: false,
                            preselectSupport: false,
                            tagSupport: {
                                valueSet: [1],
                            },
                            insertReplaceSupport: false,
                            resolveSupport: {
                                properties: [
                                    'documentation',
                                    'detail',
                                    'additionalTextEdits',
                                ],
                            },
                            insertTextModeSupport: {
                                valueSet: [1, 2],
                            },
                        },
                        completionItemKind: {
                            valueSet: [
                                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
                                15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
                            ],
                        },
                        contextSupport: true,
                    },
                    hover: {
                        dynamicRegistration: false,
                        contentFormat: ['markdown', 'plaintext'],
                    },
                },
                workspace: {
                    applyEdit: false,
                    workspaceEdit: {
                        documentChanges: false,
                        resourceOperations: ['create', 'rename', 'delete'],
                        failureHandling: 'textOnlyTransactional',
                    },
                    didChangeConfiguration: {
                        dynamicRegistration: false,
                    },
                    didChangeWatchedFiles: {
                        dynamicRegistration: false,
                    },
                    symbol: {
                        dynamicRegistration: false,
                        symbolKind: {
                            valueSet: [
                                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
                                15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
                            ],
                        },
                    },
                    executeCommand: {
                        dynamicRegistration: false,
                    },
                    configuration: true,
                    workspaceFolders: true,
                },
                window: {
                    workDoneProgress: true,
                },
            },
            trace: 'off',
            workspaceFolders: this.workspaceFolders,
        };
    }

    public async initialize(abortSignal?: AbortSignal): Promise<void> {
        const signal = abortSignal || this.abortSignal || undefined;

        // Check if already aborted
        if (signal?.aborted) {
            throw new Error('Initialization was aborted');
        }

        this.logger.info('Starting LSP server initialization');

        try {
            // Check abort signal before proceeding
            if (signal?.aborted) {
                throw new Error('Initialization was aborted');
            }

            const params = this.getInitializationOptions();
            this.logger.debug(
                'Sending initialize request with params:',
                params,
            );

            const initializeResult = await this.requestWithCancellation(
                'initialize',
                params,
                signal,
            );

            // Check abort signal after request
            if (signal?.aborted) {
                throw new Error('Initialization was aborted');
            }

            this.logger.debug('Initialize result received:', initializeResult);
            this.capabilities = initializeResult.capabilities;
            this.logger.info('Server capabilities set:', this.capabilities);

            // Обновляем capabilities в системе отмены запросов
            this.requestCancellation.updateServerCapabilities(
                this.capabilities,
            );

            this.ready = true;
            this.logger.info('Client marked as ready');

            await this.notify('initialized', {});
            this.logger.info(
                'LSP server initialization completed successfully',
            );
        } catch (error) {
            this.logger.error('LSP server initialization failed:', error);
            throw error;
        }
    }

    public close(): void {
        this.logger.info('Closing LanguageServerClient');

        // Отменяем все активные запросы
        this.requestCancellation.dispose();

        if (this.transport && typeof this.transport.close === 'function') {
            this.logger.debug('Closing transport connection');
            this.transport.close();
        } else {
            this.logger.warn('Transport does not support close() method');
        }
        this.ready = false;
        this.logger.info('LanguageServerClient closed');
    }

    public textDocumentDidOpen(params: LSP.DidOpenTextDocumentParams) {
        this.logger.debug('textDocumentDidOpen called', {
            uri: params.textDocument.uri,
            languageId: params.textDocument.languageId,
            version: params.textDocument.version,
        });
        return this.notify('textDocument/didOpen', params);
    }

    public textDocumentDidChange(params: LSP.DidChangeTextDocumentParams) {
        this.logger.debug('textDocumentDidChange called', {
            uri: params.textDocument.uri,
            version: params.textDocument.version,
            changesCount: params.contentChanges.length,
        });
        return this.notify('textDocument/didChange', params);
    }

    public async textDocumentHover(
        params: LSP.HoverParams,
        abortSignal?: AbortSignal,
    ) {
        this.logger.debug('textDocumentHover called', {
            uri: params.textDocument.uri,
            position: params.position,
        });
        return await this.requestWithCancellation(
            'textDocument/hover',
            params,
            abortSignal,
        );
    }

    public async textDocumentCompletion(
        params: LSP.CompletionParams,
        abortSignal?: AbortSignal,
    ) {
        this.logger.debug('textDocumentCompletion called', {
            uri: params.textDocument.uri,
            position: params.position,
            context: params.context,
        });
        return await this.requestWithCancellation(
            'textDocument/completion',
            params,
            abortSignal,
        );
    }

    public attachPlugin(plugin: any) {
        this.logger.debug('Attaching plugin', {
            pluginType: plugin.constructor?.name,
        });
        this.plugins.push(plugin);
        this.logger.info(
            'Plugin attached, total plugins:',
            this.plugins.length,
        );
    }

    public detachPlugin(plugin: any) {
        this.logger.debug('Detaching plugin', {
            pluginType: plugin.constructor?.name,
        });
        const i = this.plugins.indexOf(plugin);
        if (i === -1) {
            this.logger.warn('Plugin not found for detachment');
            return;
        }
        this.plugins.splice(i, 1);
        this.logger.info(
            'Plugin detached, remaining plugins:',
            this.plugins.length,
        );

        if (this.autoClose && this.plugins.length === 0) {
            this.logger.info('No plugins remaining, auto-closing client');
            this.close();
        }
    }

    // Public API for any LSP requests
    public sendRequest<T = any>(
        method: string,
        params?: any,
        abortSignal?: AbortSignal,
    ): Promise<T> {
        return this.requestWithCancellation(method, params, abortSignal);
    }

    // Public API for any LSP notifications
    public sendNotification(method: string, params?: any): Promise<any> {
        this.logger.debug('sendNotification called', { method });
        return logAsyncMethodCall(
            this.logger,
            `sendNotification(${method})`,
            (method: string, params?: any) =>
                this.client.notify({ method, params }),
        )(method, params);
    }

    // Typed versions for known methods
    public request<K extends keyof LSPRequestMap>(
        method: K,
        params: LSPRequestMap[K][0],
        abortSignal?: AbortSignal,
    ): Promise<LSPRequestMap[K][1]> {
        return this.requestWithCancellation(method, params, abortSignal);
    }

    public notify<K extends keyof LSPNotifyMap>(
        method: K,
        params: LSPNotifyMap[K],
    ): Promise<LSPNotifyMap[K]> {
        this.logger.debug('notify called', { method });
        return logAsyncMethodCall(
            this.logger,
            `notify(${method})`,
            (method: K, params: LSPNotifyMap[K]) =>
                this.client.notify({ method, params }),
        )(method, params);
    }

    protected processNotification(notification: Notification) {
        this.logger.debug('Processing notification', {
            method: notification.method,
            pluginCount: this.plugins.length,
        });

        for (const plugin of this.plugins) {
            if (plugin.processNotification) {
                try {
                    this.logger.trace('Processing notification with plugin', {
                        pluginType: plugin.constructor?.name,
                        method: notification.method,
                    });
                    plugin.processNotification(notification);
                } catch (error) {
                    this.logger.error('Plugin failed to process notification', {
                        pluginType: plugin.constructor?.name,
                        method: notification.method,
                        error,
                    });
                }
            }
        }
    }

    /**
     * Внутренний метод для выполнения запросов с поддержкой отмены LSP
     */
    private async requestWithCancellation<T = any>(
        method: string,
        params?: any,
        abortSignal?: AbortSignal,
    ): Promise<T> {
        this.logger.debug('requestWithCancellation called', { method });

        const signal = abortSignal || this.abortSignal || undefined;

        // Создаем отменяемый запрос
        const pendingRequest = this.requestCancellation.createRequest(
            method,
            signal,
        );

        try {
            // Выполняем запрос с отслеживанием
            const requestPromise = logAsyncMethodCall(
                this.logger,
                `requestWithCancellation(${method})`,
                (method: string, params?: any) =>
                    this.client.request({ method, params }, timeout),
            )(method, params);

            // Ждем результат или отмену
            const result = await new Promise<T>((resolve, reject) => {
                let isResolved = false;

                const abortHandler = () => {
                    if (!isResolved) {
                        isResolved = true;
                        reject(RequestCancellation.createCancellationError());
                    }
                };

                pendingRequest.abortController.signal.addEventListener(
                    'abort',
                    abortHandler,
                );

                requestPromise
                    .then((value) => {
                        if (!isResolved) {
                            isResolved = true;
                            pendingRequest.abortController.signal.removeEventListener(
                                'abort',
                                abortHandler,
                            );
                            resolve(value);
                        }
                    })
                    .catch((error) => {
                        if (!isResolved) {
                            isResolved = true;
                            pendingRequest.abortController.signal.removeEventListener(
                                'abort',
                                abortHandler,
                            );
                            reject(error);
                        }
                    });
            });

            this.requestCancellation.completeRequest(pendingRequest.id, true);
            return result;
        } catch (error) {
            this.requestCancellation.completeRequest(pendingRequest.id, false);

            if (RequestCancellation.isCancellationError(error)) {
                this.logger.debug('Request was cancelled', {
                    method,
                    id: pendingRequest.id,
                });
            } else {
                this.logger.error('Request failed', {
                    method,
                    id: pendingRequest.id,
                    error,
                });
            }

            throw error;
        }
    }

    /**
     * Отменяет активный запрос по ID
     */
    public cancelRequest(
        requestId: string | number,
        reason?: string,
    ): Promise<void> {
        return this.requestCancellation.cancelRequest(requestId, reason);
    }

    /**
     * Получает информацию об активных запросах
     */
    public getPendingRequests() {
        return this.requestCancellation.getPendingRequests();
    }
}
