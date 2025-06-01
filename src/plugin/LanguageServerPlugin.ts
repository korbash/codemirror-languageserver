import * as LSP from 'vscode-languageserver-protocol';
import { EditorView, PluginValue, ViewUpdate } from '@codemirror/view';
import { CompletionContext } from '@codemirror/autocomplete';
import { setDiagnostics } from '@codemirror/lint';
import { LanguageServerClient } from '../client/LanguageServerClient';
import { HoverProvider, CompletionProvider, DiagnosticsProvider, DefaultHoverProvider, DefaultCompletionProvider, DefaultDiagnosticsProvider } from '../features';
import { Notification } from '../types/lsp';
import { client, documentUri, languageId } from './facets';

const changesDelay = 500;

export interface LanguageServerPluginOptions {
    allowHTMLContent?: boolean;
    hoverProvider?: HoverProvider;
    completionProvider?: CompletionProvider;
    diagnosticsProvider?: DiagnosticsProvider;
}

export class LanguageServerPlugin implements PluginValue {
    public client: LanguageServerClient;

    private documentUri: string;
    private languageId: string;
    private documentVersion: number;
    private changesTimeout: number;

    private hoverProvider: HoverProvider;
    private completionProvider: CompletionProvider;
    private diagnosticsProvider: DiagnosticsProvider;

    constructor(
        private view: EditorView,
        private options: LanguageServerPluginOptions = {}
    ) {
        this.client = this.view.state.facet(client);
        this.documentUri = this.view.state.facet(documentUri);
        this.languageId = this.view.state.facet(languageId);
        this.documentVersion = 0;
        this.changesTimeout = 0;

        // Initialize feature providers
        this.hoverProvider = options.hoverProvider || new DefaultHoverProvider(options.allowHTMLContent);
        this.completionProvider = options.completionProvider || new DefaultCompletionProvider();
        this.diagnosticsProvider = options.diagnosticsProvider || new DefaultDiagnosticsProvider();

        this.client.attachPlugin(this);

        this.initialize({
            documentText: this.view.state.doc.toString(),
        });
    }

    public update(update: ViewUpdate) {
        if (update.docChanged) {
            this.documentVersion++;
            if (this.changesTimeout) {
                clearTimeout(this.changesTimeout);
            }
            this.changesTimeout = window.setTimeout(() => {
                this.sendChange();
            }, changesDelay);
        }
    }

    public destroy() {
        if (this.changesTimeout) {
            clearTimeout(this.changesTimeout);
        }
        this.client.detachPlugin(this);
    }

    public async initialize(options: { documentText: string }) {
        await this.client.initializePromise;
        
        this.client.textDocumentDidOpen({
            textDocument: {
                uri: this.documentUri,
                languageId: this.languageId,
                version: this.documentVersion,
                text: options.documentText,
            },
        });
    }

    public async sendChange() {
        this.client.textDocumentDidChange({
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
    }

    public requestDiagnostics() {
        // Diagnostics are pushed by the server via notifications
        return;
    }

    public async requestHoverTooltip(view: EditorView, pos: LSP.Position) {
        await this.client.initializePromise;

        if (!this.hoverProvider.isSupported(this.client.capabilities)) {
            return null;
        }

        return this.hoverProvider.provideHover(this.client, view, pos);
    }

    public async requestCompletion(
        context: CompletionContext,
        pos: LSP.Position,
        trigger: { triggerKind: LSP.CompletionTriggerKind; triggerCharacter?: string }
    ) {
        await this.client.initializePromise;

        if (!this.completionProvider.isSupported(this.client.capabilities)) {
            return null;
        }

        return this.completionProvider.provideCompletion(this.client, context, pos, {
            triggerKind: trigger.triggerKind,
            triggerCharacter: trigger.triggerCharacter
        });
    }

    public processNotification(notification: Notification) {
        switch (notification.method) {
            case 'textDocument/publishDiagnostics':
                this.processDiagnostics(notification.params);
                break;
        }
    }

    public processDiagnostics(params: LSP.PublishDiagnosticsParams) {
        if (!this.diagnosticsProvider.isSupported(this.client.capabilities)) {
            return;
        }

        const diagnostics = this.diagnosticsProvider.processDiagnostics(this.view, params);
        this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    }
}