import { EditorView } from '@codemirror/view';
import * as LSP from 'vscode-languageserver-protocol';
import { LanguageServerClient } from '../client/LanguageServerClient';
import { documentUri } from '../plugin/facets';
import { formatContents } from '../utils/content';

export interface HoverProvider {
    isSupported(capabilities: LSP.ServerCapabilities): boolean;
    provideHover(
        client: LanguageServerClient,
        view: EditorView,
        position: LSP.Position,
    ): Promise<{
        pos: number;
        end?: number;
        above?: boolean;
        create: () => { dom: HTMLElement };
    } | null>;
}

export class DefaultHoverProvider implements HoverProvider {
    constructor(private allowHTMLContent: boolean = false) {}

    public isSupported(capabilities: LSP.ServerCapabilities): boolean {
        return !!capabilities.hoverProvider;
    }

    public async provideHover(
        client: LanguageServerClient,
        view: EditorView,
        position: LSP.Position,
    ): Promise<{
        pos: number;
        end?: number;
        above?: boolean;
        create: () => { dom: HTMLElement };
    } | null> {
        if (!this.isSupported(client.capabilities)) {
            return null;
        }

        try {
            const result = await client.textDocumentHover({
                textDocument: {
                    uri: view.state.facet(documentUri),
                },
                position,
            });

            if (!result || !result.contents) {
                return null;
            }

            const formatted = formatContents(result.contents);
            if (!formatted) {
                return null;
            }

            return {
                pos: this.positionToOffset(view, position),
                above: true,
                create: () => {
                    const dom = document.createElement('div');
                    dom.className = 'cm-tooltip-hover';

                    if (
                        this.allowHTMLContent &&
                        formatted.dom instanceof Element
                    ) {
                        dom.appendChild(formatted.dom);
                    } else {
                        dom.textContent = formatted.dom.textContent || '';
                    }

                    return { dom };
                },
            };
        } catch (error) {
            console.error('Hover request failed:', error);
            return null;
        }
    }

    private positionToOffset(view: EditorView, position: LSP.Position): number {
        const doc = view.state.doc;
        if (position.line >= doc.lines) {
            return doc.length;
        }
        const line = doc.line(position.line + 1);
        return Math.min(line.from + position.character, line.to);
    }
}
