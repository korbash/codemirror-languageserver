import * as LSP from 'vscode-languageserver-protocol';
import { RequestManager, Client } from '@open-rpc/client-js';
import { Transport } from '@open-rpc/client-js/build/transports/Transport';
import {
    LSPRequestMap,
    LSPNotifyMap,
    Notification,
    LanguageServerClientOptions,
} from '../types/lsp';
import { createLogger, logAsyncMethodCall } from '../utils/logger';
import { globalAbortManager, throwIfAborted } from '../utils/abort';
import { RequestCancellation } from './RequestCancellation';

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

        this.logger.debug('Starting initialization');
        this.initializePromise = this.initialize();
    }

    protected getInitializationOptions(): LSP.InitializeParams {
        return {
            processId: null,
            rootUri: this.rootUri,
            workspaceFolders: this.workspaceFolders,
            capabilities: {
                workspace: {
                    applyEdit: false,
                    workspaceEdit: {
                        documentChanges: false,
                        resourceOperations: [],
                        failureHandling: 'textOnlyTransactional',
                        normalizesLineEndings: false,
                        changeAnnotationSupport: {
                            groupsOnLabel: false,
                        },
                    },
                    didChangeConfiguration: {
                        dynamicRegistration: false,
                    },
                    didChangeWatchedFiles: {
                        dynamicRegistration: false,
                        relativePatternSupport: false,
                    },
                    symbol: {
                        dynamicRegistration: false,
                        symbolKind: {
                            valueSet: [
                                LSP.SymbolKind.File,
                                LSP.SymbolKind.Module,
                                LSP.SymbolKind.Namespace,
                                LSP.SymbolKind.Package,
                                LSP.SymbolKind.Class,
                                LSP.SymbolKind.Method,
                                LSP.SymbolKind.Property,
                                LSP.SymbolKind.Field,
                                LSP.SymbolKind.Constructor,
                                LSP.SymbolKind.Enum,
                                LSP.SymbolKind.Interface,
                                LSP.SymbolKind.Function,
                                LSP.SymbolKind.Variable,
                                LSP.SymbolKind.Constant,
                                LSP.SymbolKind.String,
                                LSP.SymbolKind.Number,
                                LSP.SymbolKind.Boolean,
                                LSP.SymbolKind.Array,
                                LSP.SymbolKind.Object,
                                LSP.SymbolKind.Key,
                                LSP.SymbolKind.Null,
                                LSP.SymbolKind.EnumMember,
                                LSP.SymbolKind.Struct,
                                LSP.SymbolKind.Event,
                                LSP.SymbolKind.Operator,
                                LSP.SymbolKind.TypeParameter,
                            ],
                        },
                        tagSupport: {
                            valueSet: [LSP.SymbolTag.Deprecated],
                        },
                    },
                    executeCommand: {
                        dynamicRegistration: false,
                    },
                    configuration: true,
                    workspaceFolders: true,
                },
                textDocument: {
                    publishDiagnostics: {
                        relatedInformation: false,
                        versionSupport: false,
                        tagSupport: {
                            valueSet: [
                                LSP.DiagnosticTag.Unnecessary,
                                LSP.DiagnosticTag.Deprecated,
                            ],
                        },
                        codeDescriptionSupport: false,
                        dataSupport: false,
                    },
                    synchronization: {
                        dynamicRegistration: false,
                        willSave: false,
                        willSaveWaitUntil: false,
                        didSave: false,
                    },
                    completion: {
                        dynamicRegistration: false,
                        contextSupport: true,
                        completionItem: {
                            snippetSupport: false,
                            commitCharactersSupport: false,
                            documentationFormat: [LSP.MarkupKind.PlainText],
                            deprecatedSupport: false,
                            preselectSupport: false,
                            tagSupport: {
                                valueSet: [LSP.CompletionItemTag.Deprecated],
                            },
                            insertReplaceSupport: false,
                            resolveSupport: {
                                properties: ['documentation', 'detail'],
                            },
                            insertTextModeSupport: {
                                valueSet: [
                                    LSP.InsertTextMode.adjustIndentation,
                                ],
                            },
                        },
                        completionItemKind: {
                            valueSet: [
                                LSP.CompletionItemKind.Text,
                                LSP.CompletionItemKind.Method,
                                LSP.CompletionItemKind.Function,
                                LSP.CompletionItemKind.Constructor,
                                LSP.CompletionItemKind.Field,
                                LSP.CompletionItemKind.Variable,
                                LSP.CompletionItemKind.Class,
                                LSP.CompletionItemKind.Interface,
                                LSP.CompletionItemKind.Module,
                                LSP.CompletionItemKind.Property,
                                LSP.CompletionItemKind.Unit,
                                LSP.CompletionItemKind.Value,
                                LSP.CompletionItemKind.Enum,
                                LSP.CompletionItemKind.Keyword,
                                LSP.CompletionItemKind.Snippet,
                                LSP.CompletionItemKind.Color,
                                LSP.CompletionItemKind.File,
                                LSP.CompletionItemKind.Reference,
                                LSP.CompletionItemKind.Folder,
                                LSP.CompletionItemKind.EnumMember,
                                LSP.CompletionItemKind.Constant,
                                LSP.CompletionItemKind.Struct,
                                LSP.CompletionItemKind.Event,
                                LSP.CompletionItemKind.Operator,
                                LSP.CompletionItemKind.TypeParameter,
                            ],
                        },
                    },
                    hover: {
                        dynamicRegistration: false,
                        contentFormat: [LSP.MarkupKind.PlainText],
                    },
                },
                window: {
                    showMessage: {
                        messageActionItem: {
                            additionalPropertiesSupport: false,
                        },
                    },
                    showDocument: {
                        support: false,
                    },
                    workDoneProgress: false,
                },
                general: {
                    regularExpressions: {
                        engine: 'ECMAScript',
                        version: 'ES2020',
                    },
                    markdown: {
                        parser: 'marked',
                        version: '1.1.0',
                    },
                },
            },
            initializationOptions: this.options.initializationOptions,
        };
    }

    public async initialize(abortSignal?: AbortSignal): Promise<void> {
        const signal = globalAbortManager.createSignal(abortSignal);
        throwIfAborted(signal);

        this.logger.info('Starting LSP server initialization');

        try {
            const initializeParams = this.getInitializationOptions();
            this.logger.debug('Sending initialize request', initializeParams);

            const result = await this.sendRequest<LSP.InitializeResult>(
                'initialize',
                initializeParams,
                signal,
            );

            this.capabilities = result.capabilities;
            this.logger.info('Server capabilities received', this.capabilities);

            this.requestCancellation.updateServerCapabilities(
                this.capabilities,
            );

            this.ready = true;
            this.logger.info('Client marked as ready');

            await this.notify('initialized', {});
            this.logger.info('Initialization completed successfully');
        } catch (error: any) {
            this.logger.error('Initialization failed', error);
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
        });
        this.notify('textDocument/didOpen', params);
    }

    public textDocumentDidChange(params: LSP.DidChangeTextDocumentParams) {
        this.logger.debug('textDocumentDidChange called', {
            uri: params.textDocument.uri,
        });
        this.notify('textDocument/didChange', params);
    }

    public async textDocumentHover(
        params: LSP.HoverParams,
        abortSignal?: AbortSignal,
    ) {
        this.logger.debug('textDocumentHover called', {
            uri: params.textDocument.uri,
            position: params.position,
        });
        return await this.sendRequest<LSP.Hover>(
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
        return await this.sendRequest<
            LSP.CompletionItem[] | LSP.CompletionList | null
        >('textDocument/completion', params, abortSignal);
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
    public async sendRequest<T = any>(
        method: string,
        params?: any,
        abortSignal?: AbortSignal,
    ): Promise<T> {
        this.logger.debug('sendRequest called', { method });

        const signal = globalAbortManager.createSignal(abortSignal);

        // Создаем отменяемый запрос
        const pendingRequest = this.requestCancellation.createRequest(
            method,
            signal,
        );

        try {
            // Выполняем запрос с отслеживанием
            const result = await logAsyncMethodCall(
                this.logger,
                `sendRequest(${method})`,
                (method: string, params?: any) =>
                    this.client.request({ method, params }, null as any),
            )(method, params);

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
    public async request<K extends keyof LSPRequestMap>(
        method: K,
        params: LSPRequestMap[K][0],
        abortSignal?: AbortSignal,
    ): Promise<LSPRequestMap[K][1]> {
        return this.sendRequest(method, params, abortSignal);
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

    public cancelRequest(
        requestId: string | number,
        reason?: string,
    ): Promise<void> {
        return this.requestCancellation.cancelRequest(requestId, reason);
    }

    public getPendingRequests() {
        return this.requestCancellation.getPendingRequests();
    }
}
