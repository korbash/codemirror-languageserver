import * as LSP from 'vscode-languageserver-protocol';
import { EditorView } from '@codemirror/view';
import { Diagnostic } from '@codemirror/lint';
import { LanguageServerClient } from '../client/LanguageServerClient';
import { posToOffset } from '../utils/position';

export interface DiagnosticsProvider {
    isSupported(capabilities: LSP.ServerCapabilities): boolean;
    processDiagnostics(
        view: EditorView,
        params: LSP.PublishDiagnosticsParams
    ): Diagnostic[];
}

export class DefaultDiagnosticsProvider implements DiagnosticsProvider {
    public isSupported(capabilities: LSP.ServerCapabilities): boolean {
        // Diagnostics are supported by default in LSP
        return true;
    }

    public processDiagnostics(
        view: EditorView,
        params: LSP.PublishDiagnosticsParams
    ): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const doc = view.state.doc;

        for (const diagnostic of params.diagnostics) {
            try {
                const from = posToOffset(doc, diagnostic.range.start);
                const to = posToOffset(doc, diagnostic.range.end);

                if (from >= 0 && to >= from && to <= doc.length) {
                    diagnostics.push({
                        from,
                        to,
                        severity: this.mapSeverity(diagnostic.severity),
                        message: diagnostic.message,
                        source: diagnostic.source,
                    });
                }
            } catch (error) {
                console.warn('Failed to process diagnostic:', diagnostic, error);
            }
        }

        return diagnostics;
    }

    private mapSeverity(severity?: LSP.DiagnosticSeverity): 'error' | 'warning' | 'info' | 'hint' {
        switch (severity) {
            case LSP.DiagnosticSeverity.Error:
                return 'error';
            case LSP.DiagnosticSeverity.Warning:
                return 'warning';
            case LSP.DiagnosticSeverity.Information:
                return 'info';
            case LSP.DiagnosticSeverity.Hint:
                return 'hint';
            default:
                return 'error';
        }
    }

    // Code actions are handled separately through textDocument/codeAction requests
    // This method is kept for future implementation
    private convertCodeActions(codeActions: LSP.CodeAction[]): any[] {
        return codeActions.map(action => ({
            name: action.title,
            apply: (view: EditorView) => {
                // Code action application would be implemented here
                // For now, just log the action
                console.log('Code action triggered:', action.title);
            }
        }));
    }
}

export function createDiagnosticsProvider(options: { allowCodeActions?: boolean } = {}): DiagnosticsProvider {
    return new DefaultDiagnosticsProvider();
}