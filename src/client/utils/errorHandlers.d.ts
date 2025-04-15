import { TFunction } from 'react-i18next';
export interface ErrorMapping {
    pattern: RegExp | string;
    fields?: Record<string, string>;
    notification?: {
        message: string;
        description: string;
        type: 'error' | 'warning' | 'info' | 'success';
        duration?: number;
    };
}
export declare const MySQLErrorPatterns: {
    CONNECTION_REFUSED: string;
    ACCESS_DENIED: string;
    DB_NOT_EXISTS: string;
    TIMEOUT: string;
    TABLE_EXISTS: string;
    NO_PRIVILEGES: string;
};
export declare const handleAPIError: (error: any, t: TFunction, errorMappings?: ErrorMapping[], defaultMessage?: string) => {
    formErrors?: Record<string, string>;
    showNotification: boolean;
};
export declare const getMySQLConnectionErrorMappings: (t: TFunction) => ErrorMapping[];
export declare const getTableOperationErrorMappings: (t: TFunction) => ErrorMapping[];
