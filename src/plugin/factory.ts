import { autocompletion } from '@codemirror/autocomplete';
import { linter } from '@codemirror/lint';
import { hoverTooltip, ViewPlugin, EditorView } from '@codemirror/view';
import { WebSocketTransport } from '@open-rpc/client-js';
import * as LSP from 'vscode-languageserver-protocol';
import { LanguageServerClient } from '../client/LanguageServerClient';
import {
    LanguageServerOptions,
    LanguageServerWebsocketOptions,
} from '../types/lsp';
import { offsetToPos } from '../utils/position';
import { client, documentUri, languageId } from './facets';
import {
    LanguageServerPlugin,
    LanguageServerPluginOptions,
} from './LanguageServerPlugin';

export async function languageServer<TInitOptions = unknown>(
    options: LanguageServerWebsocketOptions<TInitOptions>,
) {
    const serverUri = options.serverUri;
    const { serverUri: _, ...optionsWithoutServerUri } = options;
    const transport = new WebSocketTransport(serverUri);

    return await languageServerWithTransport<TInitOptions>({
        ...optionsWithoutServerUri,
        transport,
    });
}

export async function languageServerWithTransport<TInitOptions = unknown>(
    options: LanguageServerOptions<TInitOptions>,
) {
    const lspClient =
        options.client ||
        new LanguageServerClient<TInitOptions>({
            ...options,
            autoClose: true,
        });

    await lspClient.initializePromise;

    let plugin: LanguageServerPlugin | null = null;

    const pluginOptions: LanguageServerPluginOptions = {
        allowHTMLContent: options.allowHTMLContent,
        abortSignal: options.abortSignal,
    };

    return [
        client.of(lspClient),
        documentUri.of(options.documentUri),
        languageId.of(options.languageId),
        ViewPlugin.define(
            (view) => (plugin = new LanguageServerPlugin(view, pluginOptions)),
        ),
        hoverTooltip(
            (view, pos) =>
                plugin?.requestHoverTooltip(
                    view,
                    offsetToPos(view.state.doc, pos),
                    options.abortSignal,
                ) ?? null,
        ),
        autocompletion({
            override: [
                async (context) => {
                    if (plugin == null) {
                        return null;
                    }

                    const { state, pos, explicit } = context;
                    const line = state.doc.lineAt(pos);
                    let trigKind: LSP.CompletionTriggerKind =
                        LSP.CompletionTriggerKind.Invoked;
                    let trigChar: string | undefined;
                    if (
                        !explicit &&
                        plugin.client.capabilities?.completionProvider?.triggerCharacters?.includes(
                            line.text[pos - line.from - 1],
                        )
                    ) {
                        trigKind = LSP.CompletionTriggerKind.TriggerCharacter;
                        trigChar = line.text[pos - line.from - 1];
                    }
                    if (
                        trigKind === LSP.CompletionTriggerKind.Invoked &&
                        !context.matchBefore(/\w+$/)
                    ) {
                        return null;
                    }
                    return await plugin.requestCompletion(
                        context,
                        offsetToPos(state.doc, pos),
                        {
                            triggerCharacter: trigChar,
                            triggerKind: trigKind,
                        },
                        options.abortSignal,
                    );
                },
            ],
        }),
        linter(() => []),
    ];
}

export function getLanguageServerClient(
    view: EditorView,
): LanguageServerClient | null {
    try {
        return view.state.facet(client);
    } catch {
        return null;
    }
}
