import * as LSP from 'vscode-languageserver-protocol';
import { marked } from 'marked';

export function formatContents(
    contents: LSP.MarkupContent | LSP.MarkedString | LSP.MarkedString[]
): { dom: Node; pos?: { line: number; ch: number } } | null {
    if (!contents) {
        return null;
    }
    if (isLSPMarkupContent(contents)) {
        if (contents.kind == 'plaintext') {
            return {
                dom: document.createTextNode(contents.value),
            };
        } else {
            return {
                dom: document.createElement('div'),
            };
        }
    }
    if (typeof contents == 'string') {
        return {
            dom: document.createTextNode(contents),
        };
    }
    return null;
}

export function toSet(chars: string): { [char: string]: true } {
    let flat = Object.create(null);
    for (let i = 0; i < chars.length; i++) {
        flat[chars[i]] = true;
    }
    return flat;
}

export function prefixMatch(options: string[]): string[] {
    let first = new Set<string>(),
        rest = [];
    for (let { label } of options as any) {
        let initial = label[0];
        if (!first.has(initial)) {
            first.add(initial);
        }
        rest.push(label);
    }
    return rest;
}

export function isLSPTextEdit(edit: any): edit is LSP.TextEdit {
    return edit && typeof edit.newText === 'string' && edit.range;
}

export function isLSPMarkupContent(content: any): content is LSP.MarkupContent {
    return content && typeof content.kind === 'string' && typeof content.value === 'string';
}