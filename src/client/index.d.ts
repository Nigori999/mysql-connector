import React from 'react';
import { Plugin } from '@nocobase/client';
declare module '@nocobase/client' {
    interface Application {
        addMenuItem(name: string, item: any): void;
        addComponents(components: Record<string, React.ComponentType<any>>): void;
        addProvider(provider: React.ComponentType<any>): void;
        setPluginSettings(pluginName: string, settings: any): void;
    }
}
export default class MySQLConnectorPlugin extends Plugin {
    load(): Promise<void>;
}
