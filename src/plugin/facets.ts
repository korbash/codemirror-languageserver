import { Facet } from '@codemirror/state';
import { LanguageServerClient } from '../client/LanguageServerClient';

export const client = Facet.define<LanguageServerClient, LanguageServerClient>({
    combine: (values) => values[0],
});

export const documentUri = Facet.define<string, string>({
    combine: (values) => values[0],
});

export const languageId = Facet.define<string, string>({
    combine: (values) => values[0],
});
