import { Text } from '@codemirror/state';
import * as LSP from 'vscode-languageserver-protocol';

export function posToOffset(doc: Text, pos: LSP.Position): number {
    if (pos.line >= doc.lines) {
        return doc.length;
    }
    const line = doc.line(pos.line + 1);
    return Math.min(line.from + pos.character, line.to);
}

export function offsetToPos(doc: Text, offset: number): LSP.Position {
    const line = doc.lineAt(offset);
    return {
        line: line.number - 1,
        character: offset - line.from,
    };
}
