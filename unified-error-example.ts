/**
 * Unified Error Handling Example
 *
 * This example demonstrates the improved error handling approach where:
 * - ResponseError from Microsoft LSP protocol is converted to LSPError
 * - All errors in LSPResult are now Error instances
 * - Unified error handling with preserved LSP-specific information
 */

import { ResponseError, LSPErrorCodes } from 'vscode-languageserver-protocol';
import {
    LSPResult,
    LSPError,
    normalizeError,
    isLSPError,
    isCancellationError,
    shouldNotRetryError,
    formatErrorForLogging,
} from './src/index
