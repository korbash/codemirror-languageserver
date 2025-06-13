import { CompletionContext } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import { EditorView, PluginValue, ViewUpdate } from '@codemirror/view';
import * as LSP from 'vscode-languageserver-protocol';
import { LanguageServerClient } from '../client/LanguageServerClient';
import {
    CompletionProvider,
    DefaultCompletionProvider,
    DefaultDiagnosticsProvider,
    DefaultHoverProvider,
    DiagnosticsProvider,
    HoverProvider,
} from '../features';
import { Notification } from '../types/lsp';
import {
    createLogger,
    logAsyncMethodCall,
    logMethodCall,
} from '../utils/logger';
import { client, documentUri, languageId } from './facets';

const changesDelay = 500;

export interface LanguageServerPluginOptions {
    allowHTMLContent?: boolean;
    hoverProvider?: HoverProvider;
    completionProvider?: CompletionProvider;
    diagnosticsProvider?: DiagnosticsProvider;
    abortSignal?: AbortSignal;
}

export class LanguageServerPlugin implements PluginValue {
    public client: LanguageServerClient;

    private documentUri: string;
    private languageId: string;
    private documentVersion: number;
    private changesTimeout: number;
    private logger = createLogger('PLUGIN');
    private abortSignal: AbortSignal | null = null;

    private hoverProvider: HoverProvider;
    private completionProvider: CompletionProvider;
    private diagnosticsProvider: DiagnosticsProvider;

    constructor(
        private view: EditorView,
        private options: LanguageServerPluginOptions = {},
    ) {
        this.logger.info('Creating LanguageServerPlugin', {
            documentLength: this.view.state.doc.length,
            allowHTMLContent: options.allowHTMLContent,
            hasCustomProviders: {
                hover: !!options.hoverProvider,
                completion: !!options.completionProvider,
                diagnostics: !!options.diagnosticsProvider,
            },
        });

        this.client = this.view.state.facet(client);
        this.documentUri = this.view.state.facet(documentUri);
        this.languageId = this.view.state.facet(languageId);
        this.documentVersion = 0;
        this.changesTimeout = 0;
        this.abortSignal = options.abortSignal || null;

        this.logger.debug('Plugin configuration', {
            documentUri: this.documentUri,
            languageId: this.languageId,
            clientReady: this.client.ready,
            hasAbortSignal: !!this.abortSignal,
        });

        // Initialize feature providers
        this.hoverProvider =
            options.hoverProvider ||
            new DefaultHoverProvider(options.allowHTMLContent);
        this.completionProvider =
            options.completionProvider || new DefaultCompletionProvider();
        this.diagnosticsProvider =
            options.diagnosticsProvider || new DefaultDiagnosticsProvider();

        this.logger.debug('Feature providers initialized', {
            hoverProvider: this.hoverProvider.constructor.name,
            completionProvider: this.completionProvider.constructor.name,
            diagnosticsProvider: this.diagnosticsProvider.constructor.name,
        });

        this.client.attachPlugin(this);
        this.logger.debug('Plugin attached to client');

        this.initialize({
            documentText: this.view.state.doc.toString(),
        });
    }

    public update(update: ViewUpdate) {
        if (update.docChanged) {
            this.documentVersion++;
            this.logger.debug('Document changed', {
                newVersion: this.documentVersion,
                docLength: update.state.doc.length,
                changeCount: update.changes.length,
            });

            if (this.changesTimeout) {
                clearTimeout(this.changesTimeout);
                this.logger.trace('Cleared previous changes timeout');
            }
            this.changesTimeout = window.setTimeout(() => {
                this.logger.trace(
                    'Changes timeout triggered, sending change notification',
                );
                this.sendChange();
            }, changesDelay);
        }
    }

    public destroy() {
        this.logger.info('Destroying LanguageServerPlugin');
        if (this.changesTimeout) {
            clearTimeout(this.changesTimeout);
            this.logger.debug('Cleared changes timeout');
        }
        this.client.detachPlugin(this);
        this.logger.info('Plugin destroyed and detached from client');
    }

    public async initialize(options: { documentText: string }) {
        // Check if already aborted
        if (this.abortSignal?.aborted) {
            throw new Error('Plugin initialization was aborted');
        }

        this.logger.info('Initializing plugin', {
            documentLength: options.documentText.length,
            documentUri: this.documentUri,
            languageId: this.languageId,
        });

        try {
            this.logger.debug('Waiting for client initialization...');
            await this.client.initializePromise;

            // Check if aborted after client initialization
            if (this.abortSignal?.aborted) {
                throw new Error('Plugin initialization was aborted');
            }

            this.logger.info('Client initialization completed');

            this.logger.debug('Sending textDocument/didOpen notification');
            await this.client.textDocumentDidOpen({
                textDocument: {
                    uri: this.documentUri,
                    languageId: this.languageId,
                    version: this.documentVersion,
                    text: options.documentText,
                },
            });
            this.logger.info('Plugin initialization completed successfully');
        } catch (error) {
            this.logger.error('Plugin initialization failed:', error);
            throw error;
        }
    }

    public async sendChange() {
        this.logger.debug('Sending document change notification', {
            documentVersion: this.documentVersion,
            documentLength: this.view.state.doc.length,
        });

        try {
            await this.client.textDocumentDidChange({
                textDocument: {
                    uri: this.documentUri,
                    version: this.documentVersion,
                },
                contentChanges: [
                    {
                        text: this.view.state.doc.toString(),
                    },
                ],
            });
            this.logger.trace('Document change notification sent successfully');
        } catch (error) {
            this.logger.error(
                'Failed to send document change notification:',
                error,
            );
        }
    }

    public requestDiagnostics() {
        // Diagnostics are pushed by the server via notifications
        this.logger.trace(
            'requestDiagnostics called (diagnostics are push-based)',
        );
        return;
    }

    public async requestHoverTooltip(
        view: EditorView,
        pos: LSP.Position,
        abortSignal?: AbortSignal,
    ) {
        const signal = abortSignal || this.abortSignal || undefined;

        // Check if already aborted
        if (signal?.aborted) {
            this.logger.debug('Hover request aborted before execution');
            return null;
        }

        this.logger.debug('requestHoverTooltip called', {
            position: pos,
            documentUri: this.documentUri,
        });

        try {
            await this.client.initializePromise;

            // Check if aborted after client initialization
            if (signal?.aborted) {
                this.logger.debug(
                    'Hover request aborted after client initialization',
                );
                return null;
            }

            if (!this.hoverProvider.isSupported(this.client.capabilities)) {
                this.logger.debug('Hover not supported by server capabilities');
                return null;
            }

            this.logger.trace('Requesting hover from provider');
            const result = await this.hoverProvider.provideHover(
                this.client,
                view,
                pos,
                signal,
            );
            this.logger.debug('Hover request completed', {
                hasResult: !!result,
            });
            return result;
        } catch (error) {
            if (
                error instanceof Error &&
                error.message === 'Request was aborted'
            ) {
                this.logger.debug('Hover request was aborted');
                return null;
            }
            this.logger.error('Hover request failed:', error);
            return null;
        }
    }

    public async requestCompletion(
        context: CompletionContext,
        pos: LSP.Position,
        trigger: {
            triggerKind: LSP.CompletionTriggerKind;
            triggerCharacter?: string;
        },
        abortSignal?: AbortSignal,
    ) {
        const signal = abortSignal || this.abortSignal || undefined;

        // Check if already aborted
        if (signal?.aborted) {
            this.logger.debug('Completion request aborted before execution');
            return null;
        }

        this.logger.debug('requestCompletion called', {
            position: pos,
            triggerKind: trigger.triggerKind,
            triggerCharacter: trigger.triggerCharacter,
            documentUri: this.documentUri,
        });

        try {
            await this.client.initializePromise;

            // Check if aborted after client initialization
            if (signal?.aborted) {
                this.logger.debug(
                    'Completion request aborted after client initialization',
                );
                return null;
            }

            if (
                !this.completionProvider.isSupported(this.client.capabilities)
            ) {
                this.logger.debug(
                    'Completion not supported by server capabilities',
                );
                return null;
            }

            this.logger.trace('Requesting completion from provider');
            const result = await this.completionProvider.provideCompletion(
                this.client,
                context,
                pos,
                {
                    triggerKind: trigger.triggerKind,
                    triggerCharacter: trigger.triggerCharacter,
                },
                signal,
            );
            this.logger.debug('Completion request completed', {
                hasResult: !!result,
                resultType: Array.isArray(result) ? 'array' : typeof result,
            });
            return result;
        } catch (error) {
            if (
                error instanceof Error &&
                error.message === 'Request was aborted'
            ) {
                this.logger.debug('Completion request was aborted');
                return null;
            }
            this.logger.error('Completion request failed:', error);
            return null;
        }
    }

    public processNotification(notification: Notification) {
        this.logger.debug('Processing notification', {
            method: notification.method,
            hasParams: !!notification.params,
        });

        switch (notification.method) {
            case 'textDocument/publishDiagnostics':
                this.logger.trace('Processing diagnostics notification');
                this.processDiagnostics(notification.params);
                break;
            default:
                this.logger.trace(
                    'Unhandled notification method:',
                    notification.method,
                );
        }
    }

    public processDiagnostics(params: LSP.PublishDiagnosticsParams) {
        this.logger.debug('processDiagnostics called', {
            uri: params.uri,
            diagnosticsCount: params.diagnostics.length,
            version: params.version,
        });

        if (!this.diagnosticsProvider.isSupported(this.client.capabilities)) {
            this.logger.debug(
                'Diagnostics not supported by server capabilities',
            );
            return;
        }

        try {
            this.logger.trace('Processing diagnostics with provider');
            const diagnostics = this.diagnosticsProvider.processDiagnostics(
                this.view,
                params,
            );

            this.logger.debug('Dispatching diagnostics to editor', {
                processedDiagnosticsCount: diagnostics.length,
            });
            this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
            this.logger.trace(
                'Diagnostics processed and dispatched successfully',
            );
        } catch (error) {
            this.logger.error('Failed to process diagnostics:', error);
        }
    }
}
