import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import * as LSP from 'vscode-languageserver-protocol';
import { LanguageServerClient } from '../client/LanguageServerClient';
import { documentUri } from '../plugin/facets';

export interface CompletionProvider {
    isSupported(capabilities: LSP.ServerCapabilities): boolean;
    provideCompletion(
        client: LanguageServerClient,
        context: CompletionContext,
        position: LSP.Position,
        trigger: {
            triggerKind: LSP.CompletionTriggerKind;
            triggerCharacter?: string;
        }
    ): Promise<CompletionResult | null>;
}

export class DefaultCompletionProvider implements CompletionProvider {
    public isSupported(capabilities: LSP.ServerCapabilities): boolean {
        return !!capabilities.completionProvider;
    }

    public async provideCompletion(
        client: LanguageServerClient,
        context: CompletionContext,
        position: LSP.Position,
        trigger: {
            triggerKind: LSP.CompletionTriggerKind;
            triggerCharacter?: string;
        }
    ): Promise<CompletionResult | null> {
        if (!this.isSupported(client.capabilities)) {
            return null;
        }

        try {
            const result = await client.textDocumentCompletion({
                textDocument: {
                    uri: context.state.facet(documentUri),
                },
                position,
                context: {
                    triggerKind: trigger.triggerKind,
                    triggerCharacter: trigger.triggerCharacter,
                },
            });

            if (!result) {
                return null;
            }

            const items = Array.isArray(result) ? result : result.items;
            if (!items || items.length === 0) {
                return null;
            }

            return {
                from: this.getCompletionStart(context),
                options: items.map((item) =>
                    this.convertCompletionItem(item, context)
                ),
            };
        } catch (error) {
            console.error('Completion request failed:', error);
            return null;
        }
    }

    private getCompletionStart(context: CompletionContext): number {
        const word = context.matchBefore(/\w+$/);
        return word ? word.from : context.pos;
    }

    private convertCompletionItem(
        item: LSP.CompletionItem,
        context: CompletionContext
    ): any {
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
                completion.apply = (
                    view: EditorView,
                    completion: any,
                    from: number,
                    to: number
                ) => {
                    const edit = item.textEdit as LSP.TextEdit;
                    const editFrom = this.positionToOffset(
                        view.state.doc,
                        edit.range.start
                    );
                    const editTo = this.positionToOffset(
                        view.state.doc,
                        edit.range.end
                    );

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
        if (position.line >= doc.lines) {
            return doc.length;
        }
        const line = doc.line(position.line + 1);
        return Math.min(line.from + position.character, line.to);
    }
}
