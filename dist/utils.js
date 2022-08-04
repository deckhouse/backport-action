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
exports.parseDisplayNameEmail = exports.getInputMergeMethod = exports.getStringAsArray = exports.getInputAsArray = void 0;
const core = __importStar(require("@actions/core"));
function getInputAsArray(name, options) {
    return getStringAsArray(core.getInput(name, options));
}
exports.getInputAsArray = getInputAsArray;
function getStringAsArray(str) {
    return str
        .split(",")
        .map((s) => s.trim())
        .filter((x) => x !== "");
}
exports.getStringAsArray = getStringAsArray;
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
exports.getInputMergeMethod = getInputMergeMethod;
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
exports.parseDisplayNameEmail = parseDisplayNameEmail;
