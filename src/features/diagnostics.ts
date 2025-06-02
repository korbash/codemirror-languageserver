import { Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import * as LSP from 'vscode-languageserver-protocol';
import { posToOffset } from '../utils/position';
import { createLogger } from '../utils/logger';

export interface DiagnosticsProvider {
    isSupported(capabilities: LSP.ServerCapabilities): boolean;
    processDiagnostics(
        view: EditorView,
        params: LSP.PublishDiagnosticsParams,
    ): Diagnostic[];
}

export class DefaultDiagnosticsProvider implements DiagnosticsProvider {
    private logger = createLogger('DIAGNOSTICS');

    constructor() {
        this.logger.debug('DefaultDiagnosticsProvider created');
    }

    public isSupported(capabilities: LSP.ServerCapabilities): boolean {
        // Diagnostics are supported by default in LSP
        this.logger.debug('Checking diagnostics support (always supported)');
        return true;
    }

    public processDiagnostics(
        view: EditorView,
        params: LSP.PublishDiagnosticsParams,
    ): Diagnostic[] {
        this.logger.debug('processDiagnostics called', {
            uri: params.uri,
            diagnosticsCount: params.diagnostics.length,
            version: params.version,
        });

        const diagnostics: Diagnostic[] = [];
        const doc = view.state.doc;

        for (const diagnostic of params.diagnostics) {
            try {
                this.logger.trace('Processing diagnostic', {
                    range: diagnostic.range,
                    severity: diagnostic.severity,
                    message: diagnostic.message,
                    source: diagnostic.source,
                });

                const from = posToOffset(doc, diagnostic.range.start);
                const to = posToOffset(doc, diagnostic.range.end);

                this.logger.trace('Calculated diagnostic positions', {
                    from,
                    to,
                    docLength: doc.length,
                });

                if (from >= 0 && to >= from && to <= doc.length) {
                    const mappedSeverity = this.mapSeverity(
                        diagnostic.severity,
                    );
                    diagnostics.push({
                        from,
                        to,
                        severity: mappedSeverity,
                        message: diagnostic.message,
                        source: diagnostic.source,
                    });

                    this.logger.trace('Diagnostic added', {
                        from,
                        to,
                        severity: mappedSeverity,
                        message: diagnostic.message,
                    });
                } else {
                    this.logger.warn('Invalid diagnostic range, skipping', {
                        from,
                        to,
                        docLength: doc.length,
                        diagnostic: diagnostic.range,
                    });
                }
            } catch (error) {
                this.logger.error('Failed to process diagnostic:', {
                    diagnostic,
                    error,
                });
            }
        }

        this.logger.debug('Diagnostics processing completed', {
            inputCount: params.diagnostics.length,
            outputCount: diagnostics.length,
        });

        return diagnostics;
    }

    private mapSeverity(
        severity?: LSP.DiagnosticSeverity,
    ): 'error' | 'warning' | 'info' | 'hint' {
        const mapped = (() => {
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
        })();

        this.logger.trace('Mapped diagnostic severity', {
            input: severity,
            output: mapped,
        });

        return mapped;
    }

    // Code actions are handled separately through textDocument/codeAction requests
    // This method is kept for future implementation
    private convertCodeActions(codeActions: LSP.CodeAction[]): any[] {
        this.logger.debug('Converting code actions', {
            actionsCount: codeActions.length,
        });

        return codeActions.map((action) => {
            this.logger.trace('Converting code action', {
                title: action.title,
                kind: action.kind,
            });

            return {
                name: action.title,
                apply: (view: EditorView) => {
                    // Code action application would be implemented here
                    // For now, just log the action
                    this.logger.info('Code action triggered:', action.title);
                },
            };
        });
    }
}

export function createDiagnosticsProvider(
    options: { allowCodeActions?: boolean } = {},
): DiagnosticsProvider {
    const logger = createLogger('DIAGNOSTICS');
    logger.debug('Creating diagnostics provider', options);
    return new DefaultDiagnosticsProvider();
}
