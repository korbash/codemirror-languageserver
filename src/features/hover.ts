import { EditorView } from '@codemirror/view';
import * as LSP from 'vscode-languageserver-protocol';
import { LanguageServerClient } from '../client/LanguageServerClient';
import { documentUri } from '../plugin/facets';
import { formatContents } from '../utils/content';
import { createLogger } from '../utils/logger';

export interface HoverProvider {
    isSupported(capabilities: LSP.ServerCapabilities): boolean;
    provideHover(
        client: LanguageServerClient,
        view: EditorView,
        position: LSP.Position,
        abortSignal?: AbortSignal,
    ): Promise<{
        pos: number;
        end?: number;
        above?: boolean;
        create: () => { dom: HTMLElement };
    } | null>;
}

export class DefaultHoverProvider implements HoverProvider {
    private logger = createLogger('HOVER');

    constructor(private allowHTMLContent: boolean = false) {
        this.logger.debug('DefaultHoverProvider created', { allowHTMLContent });
    }

    public isSupported(capabilities: LSP.ServerCapabilities): boolean {
        const supported = !!capabilities.hoverProvider;
        this.logger.debug('Checking hover support', {
            supported,
            hoverProvider: capabilities.hoverProvider,
        });
        return supported;
    }

    public async provideHover(
        client: LanguageServerClient,
        view: EditorView,
        position: LSP.Position,
        abortSignal?: AbortSignal,
    ): Promise<{
        pos: number;
        end?: number;
        above?: boolean;
        create: () => { dom: HTMLElement };
    } | null> {
        const uri = view.state.facet(documentUri);
        this.logger.debug('provideHover called', {
            uri,
            position,
            allowHTMLContent: this.allowHTMLContent,
            hasAbortSignal: !!abortSignal,
        });

        // Check if already aborted
        if (abortSignal?.aborted) {
            this.logger.debug('Hover request aborted before execution');
            return null;
        }

        if (!this.isSupported(client.capabilities)) {
            this.logger.debug('Hover not supported, returning null');
            return null;
        }

        try {
            this.logger.trace('Sending textDocumentHover request');
            const result = await client.textDocumentHover(
                {
                    textDocument: { uri },
                    position,
                },
                abortSignal,
            );

            this.logger.debug('Hover response received', {
                hasResult: !!result,
                hasContents: !!(result && result.contents),
                range: result?.range,
            });

            if (!result || !result.contents) {
                this.logger.debug(
                    'No hover result or contents, returning null',
                );
                return null;
            }

            this.logger.trace('Formatting hover contents');
            const formatted = formatContents(result.contents);
            if (!formatted) {
                this.logger.debug('Failed to format contents, returning null');
                return null;
            }

            const offset = this.positionToOffset(view, position);
            this.logger.debug('Hover tooltip created successfully', {
                offset,
                formattedType: typeof formatted.dom,
                isElement: formatted.dom instanceof Element,
            });

            return {
                pos: offset,
                above: true,
                create: () => {
                    this.logger.trace('Creating hover tooltip DOM');
                    const dom = document.createElement('div');
                    dom.className = 'cm-tooltip-hover';

                    if (
                        this.allowHTMLContent &&
                        formatted.dom instanceof Element
                    ) {
                        this.logger.trace('Appending HTML content to tooltip');
                        dom.appendChild(formatted.dom);
                    } else {
                        this.logger.trace('Setting text content for tooltip');
                        dom.textContent = formatted.dom.textContent || '';
                    }

                    return { dom };
                },
            };
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

    private positionToOffset(view: EditorView, position: LSP.Position): number {
        const doc = view.state.doc;
        this.logger.trace('Converting position to offset', {
            position,
            docLines: doc.lines,
            docLength: doc.length,
        });

        if (position.line >= doc.lines) {
            this.logger.trace(
                'Position line beyond document, returning doc length',
            );
            return doc.length;
        }

        const line = doc.line(position.line + 1);
        const offset = Math.min(line.from + position.character, line.to);

        this.logger.trace('Position converted to offset', {
            lineFrom: line.from,
            lineTo: line.to,
            character: position.character,
            finalOffset: offset,
        });

        return offset;
    }
}
