"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatOctokitRequestError = formatOctokitRequestError;
exports.getInputAsArray = getInputAsArray;
exports.getStringAsArray = getStringAsArray;
exports.getInputMergeMethod = getInputMergeMethod;
exports.parseDisplayNameEmail = parseDisplayNameEmail;
const core = __importStar(require("@actions/core"));
function formatOctokitRequestError(err) {
    var _a;
    if (typeof err !== "object" || err === null) {
        return String(err);
    }
    const o = err;
    const parts = [];
    if (typeof o.status === "number") {
        parts.push(`HTTP ${o.status}`);
    }
    if (typeof o.message === "string") {
        parts.push(o.message);
    }
    if (((_a = o.response) === null || _a === void 0 ? void 0 : _a.data) !== undefined) {
        parts.push(`body: ${JSON.stringify(o.response.data)}`);
    }
    return parts.length > 0 ? parts.join(" | ") : String(err);
}
function getInputAsArray(name, options) {
    return getStringAsArray(core.getInput(name, options));
}
function getStringAsArray(str) {
    return str
        .split(",")
        .map((s) => s.trim())
        .filter((x) => x !== "");
}
function getInputMergeMethod(name, options) {
    const value = core.getInput(name, options);
    switch (value.trim()) {
        case "merge":
            return "merge";
        case "squash":
            return "squash";
        case "rebase":
            return "rebase";
        default:
            return undefined;
    }
}
function parseDisplayNameEmail(displayNameEmail) {
    const pattern = /^([^<]+)\s*<([^>]+)>$/i;
    const match = displayNameEmail.match(pattern);
    if (!match) {
        throw new Error(`The format of '${displayNameEmail}' is not a valid email address with display name`);
    }
    const name = match[1].trim();
    const email = match[2].trim();
    if (!name || !email) {
        throw new Error(`The format of '${displayNameEmail}' is not a valid email address with display name`);
    }
    return { name, email };
}
