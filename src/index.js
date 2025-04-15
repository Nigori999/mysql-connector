"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = exports.server = void 0;
// src/index.ts - 插件主入口文件
const server_1 = __importDefault(require("./server"));
Object.defineProperty(exports, "server", { enumerable: true, get: function () { return server_1.default; } });
const client_1 = __importDefault(require("./client"));
Object.defineProperty(exports, "client", { enumerable: true, get: function () { return client_1.default; } });
exports.default = { server: server_1.default, client: client_1.default };
