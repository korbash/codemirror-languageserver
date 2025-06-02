import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import * as LSP from 'vscode-languageserver-protocol';
import { LanguageServerClient } from '../client/LanguageServerClient';
import { documentUri } from '../plugin/facets';
import { createLogger } from '../utils/logger';

export interface CompletionProvider {
    isSupported(capabilities: LSP.ServerCapabilities): boolean;
    provideCompletion(
        client: LanguageServerClient,
        context: CompletionContext,
        position: LSP.Position,
        trigger: {
            triggerKind: LSP.CompletionTriggerKind;
            triggerCharacter?: string;
        },
    ): Promise<CompletionResult | null>;
}

export class DefaultCompletionProvider implements CompletionProvider {
    private logger = createLogger('COMPLETION');

    constructor() {
        this.logger.debug('DefaultCompletionProvider created');
    }

    public isSupported(capabilities: LSP.ServerCapabilities): boolean {
        const supported = !!capabilities.completionProvider;
        this.logger.debug('Checking completion support', {
            supported,
            completionProvider: capabilities.completionProvider,
        });
        return supported;
    }

    public async provideCompletion(
        client: LanguageServerClient,
        context: CompletionContext,
        position: LSP.Position,
        trigger: {
            triggerKind: LSP.CompletionTriggerKind;
            triggerCharacter?: string;
        },
    ): Promise<CompletionResult | null> {
        const uri = context.state.facet(documentUri);
        this.logger.debug('provideCompletion called', {
            uri,
            position,
            triggerKind: trigger.triggerKind,
            triggerCharacter: trigger.triggerCharacter,
        });

        if (!this.isSupported(client.capabilities)) {
            this.logger.debug('Completion not supported, returning null');
            return null;
        }

        try {
            this.logger.trace('Sending textDocumentCompletion request');
            const result = await client.textDocumentCompletion({
                textDocument: { uri },
                position,
                context: {
                    triggerKind: trigger.triggerKind,
                    triggerCharacter: trigger.triggerCharacter,
                },
            });

            this.logger.debug('Completion response received', {
                hasResult: !!result,
                isArray: Array.isArray(result),
                resultType: typeof result,
            });

            if (!result) {
                this.logger.debug('No completion result, returning null');
                return null;
            }

            const items = Array.isArray(result) ? result : result.items;
            if (!items || items.length === 0) {
                this.logger.debug('No completion items found, returning null');
                return null;
            }

            const completionStart = this.getCompletionStart(context);
            this.logger.debug('Creating completion result', {
                itemsCount: items.length,
                completionStart,
            });

            return {
                from: completionStart,
                options: items.map((item) =>
                    this.convertCompletionItem(item, context),
                ),
            };
        } catch (error) {
            this.logger.error('Completion request failed:', error);
            return null;
        }
    }

    private getCompletionStart(context: CompletionContext): number {
        const word = context.matchBefore(/\w+$/);
        const start = word ? word.from : context.pos;
        this.logger.trace('Calculated completion start', {
            hasMatchBefore: !!word,
            contextPos: context.pos,
            calculatedStart: start,
        });
        return start;
    }

    private convertCompletionItem(
        item: LSP.CompletionItem,
        context: CompletionContext,
    ): any {
        this.logger.trace('Converting completion item', {
            label: item.label,
            kind: item.kind,
            hasDetail: !!item.detail,
            hasDocumentation: !!item.documentation,
            hasTextEdit: !!item.textEdit,
            hasInsertText: !!item.insertText,
        });

        const completion: any = {
            label: item.label,
            detail: item.detail,
            info: item.documentation
                ? this.formatDocumentation(item.documentation)
                : undefined,
            type: this.mapCompletionItemKind(item.kind),
        };

        if (item.textEdit) {
            if (this.isLSPTextEdit(item.textEdit)) {
                this.logger.trace(
                    'Setting up textEdit apply function for completion item',
                );
                completion.apply = (
                    view: EditorView,
                    completion: any,
                    from: number,
                    to: number,
                ) => {
                    const edit = item.textEdit as LSP.TextEdit;
                    const editFrom = this.positionToOffset(
                        view.state.doc,
                        edit.range.start,
                    );
                    const editTo = this.positionToOffset(
                        view.state.doc,
                        edit.range.end,
                    );

                    this.logger.trace('Applying textEdit', {
                        editFrom,
                        editTo,
                        newText: edit.newText,
                    });

                    view.dispatch({
                        changes: {
                            from: editFrom,
                            to: editTo,
                            insert: edit.newText,
                        },
                    });
                };
            }
        } else if (item.insertText) {
            this.logger.trace('Using insertText for completion item');
            completion.apply = item.insertText;
        }

        return completion;
    }

    private formatDocumentation(doc: string | LSP.MarkupContent): string {
        if (typeof doc === 'string') {
            return doc;
        }
        return doc.value;
    }

    private mapCompletionItemKind(kind?: LSP.CompletionItemKind): string {
        const CompletionItemKindMap: { [key: number]: string } = {
            [LSP.CompletionItemKind.Text]: 'text',
            [LSP.CompletionItemKind.Method]: 'method',
            [LSP.CompletionItemKind.Function]: 'function',
            [LSP.CompletionItemKind.Constructor]: 'constructor',
            [LSP.CompletionItemKind.Field]: 'field',
            [LSP.CompletionItemKind.Variable]: 'variable',
            [LSP.CompletionItemKind.Class]: 'class',
            [LSP.CompletionItemKind.Interface]: 'interface',
            [LSP.CompletionItemKind.Module]: 'module',
            [LSP.CompletionItemKind.Property]: 'property',
            [LSP.CompletionItemKind.Unit]: 'unit',
            [LSP.CompletionItemKind.Value]: 'value',
            [LSP.CompletionItemKind.Enum]: 'enum',
            [LSP.CompletionItemKind.Keyword]: 'keyword',
            [LSP.CompletionItemKind.Snippet]: 'snippet',
            [LSP.CompletionItemKind.Color]: 'color',
            [LSP.CompletionItemKind.File]: 'file',
            [LSP.CompletionItemKind.Reference]: 'reference',
            [LSP.CompletionItemKind.Folder]: 'folder',
            [LSP.CompletionItemKind.EnumMember]: 'enum-member',
            [LSP.CompletionItemKind.Constant]: 'constant',
            [LSP.CompletionItemKind.Struct]: 'struct',
            [LSP.CompletionItemKind.Event]: 'event',
            [LSP.CompletionItemKind.Operator]: 'operator',
            [LSP.CompletionItemKind.TypeParameter]: 'type-parameter',
        };

        return kind ? CompletionItemKindMap[kind] || 'text' : 'text';
    }

    private isLSPTextEdit(edit: any): edit is LSP.TextEdit {
        return edit && typeof edit.newText === 'string' && edit.range;
    }

    private positionToOffset(doc: any, position: LSP.Position): number {
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
