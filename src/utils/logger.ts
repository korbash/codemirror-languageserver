import log from 'loglevel';

// Available log levels
export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';

// Logger interface for consistency
export interface Logger {
    trace(message?: any, ...optionalParams: any[]): void;
    debug(message?: any, ...optionalParams: any[]): void;
    info(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
    error(message?: any, ...optionalParams: any[]): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
}

// Module prefixes for better debugging
const MODULE_PREFIXES = {
    CLIENT: '[LSP-Client]',
    PLUGIN: '[LSP-Plugin]',
    TRANSPORT: '[Transport]',
    COMPLETION: '[Completion]',
    HOVER: '[Hover]',
    DIAGNOSTICS: '[Diagnostics]',
    FEATURES: '[Features]',
    UTILS: '[Utils]',
} as const;

export type ModuleName = keyof typeof MODULE_PREFIXES;

// Create a logger instance with module prefix
export function createLogger(moduleName: ModuleName): Logger {
    const prefix = MODULE_PREFIXES[moduleName];

    const addPrefix = (
        level: string,
        message?: any,
        ...optionalParams: any[]
    ) => {
        const timestamp = new Date().toISOString();
        const prefixedMessage = `${timestamp} ${prefix} ${message}`;
        return [prefixedMessage, ...optionalParams];
    };

    return {
        trace: (message?: any, ...optionalParams: any[]) => {
            log.trace(...addPrefix('TRACE', message, ...optionalParams));
        },
        debug: (message?: any, ...optionalParams: any[]) => {
            log.debug(...addPrefix('DEBUG', message, ...optionalParams));
        },
        info: (message?: any, ...optionalParams: any[]) => {
            log.info(...addPrefix('INFO', message, ...optionalParams));
        },
        warn: (message?: any, ...optionalParams: any[]) => {
            log.warn(...addPrefix('WARN', message, ...optionalParams));
        },
        error: (message?: any, ...optionalParams: any[]) => {
            log.error(...addPrefix('ERROR', message, ...optionalParams));
        },
        setLevel: (level: LogLevel) => {
            log.setLevel(level as log.LogLevelDesc);
        },
        getLevel: (): LogLevel => {
            return log.getLevel() as any as LogLevel;
        },
    };
}

// Default logger for general use
export const logger = createLogger('UTILS');

// Set default log level
export function setLogLevel(level: LogLevel): void {
    try {
        log.setLevel(level as log.LogLevelDesc);
        // Save to localStorage if available
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(
                'codemirror-languageserver-log-level',
                level,
            );
        }
        logger.info(`Log level set to: ${level}`);
    } catch (error) {
        console.warn('[CM-LS] Failed to set log level:', error);
    }
}

// Get current log level
export function getLogLevel(): LogLevel {
    return log.getLevel() as any as LogLevel;
}

// Enable/disable all logging
export function enableAll(): void {
    log.enableAll();
    logger.info('All logging enabled');
}

export function disableAll(): void {
    log.disableAll();
}

// Initialize with default log level (can be overridden)
function initializeLogging(): void {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const savedLevel = window.localStorage.getItem(
                'codemirror-languageserver-log-level',
            );
            if (
                savedLevel &&
                ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT'].includes(
                    savedLevel,
                )
            ) {
                setLogLevel(savedLevel as LogLevel);
            } else {
                setLogLevel('WARN'); // Default to WARN in production
            }
        } else {
            setLogLevel('WARN'); // Default to WARN in production
        }
    } catch (error) {
        // Fallback initialization
        try {
            log.setLevel('WARN' as log.LogLevelDesc);
        } catch {
            // Silent fallback if even basic setLevel fails
        }
    }
}

// Only initialize if we're in a browser environment
if (typeof window !== 'undefined') {
    initializeLogging();
} else {
    // Node.js environment
    try {
        log.setLevel('WARN' as log.LogLevelDesc);
    } catch {
        // Silent fallback
    }
}

// Helper function to log method calls with timing
export function logMethodCall<T extends any[], R>(
    logger: Logger,
    methodName: string,
    fn: (...args: T) => R,
): (...args: T) => R {
    return (...args: T): R => {
        const startTime = performance.now();
        logger.debug(`${methodName} called with args:`, args);

        try {
            const result = fn(...args);
            const endTime = performance.now();
            logger.debug(
                `${methodName} completed in ${(endTime - startTime).toFixed(2)}ms`,
            );
            return result;
        } catch (error) {
            const endTime = performance.now();
            logger.error(
                `${methodName} failed after ${(endTime - startTime).toFixed(2)}ms:`,
                error,
            );
            throw error;
        }
    };
}

// Helper function to log async method calls with timing
export function logAsyncMethodCall<T extends any[], R>(
    logger: Logger,
    methodName: string,
    fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
        const startTime = performance.now();
        logger.debug(`${methodName} called with args:`, args);

        try {
            const result = await fn(...args);
            const endTime = performance.now();
            logger.debug(
                `${methodName} completed in ${(endTime - startTime).toFixed(2)}ms`,
            );
            return result;
        } catch (error) {
            const endTime = performance.now();
            logger.error(
                `${methodName} failed after ${(endTime - startTime).toFixed(2)}ms:`,
                error,
            );
            throw error;
        }
    };
}
