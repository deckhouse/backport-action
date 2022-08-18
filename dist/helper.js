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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPullRequest = void 0;
const github = __importStar(require("@actions/github"));
const core = __importStar(require("@actions/core"));
function createPullRequest(inputs, prBranch) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = github.getOctokit(inputs.token);
        if (process.env.GITHUB_REPOSITORY !== undefined) {
            const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
            let title = github.context.payload &&
                github.context.payload.pull_request &&
                github.context.payload.pull_request.title;
            title = "Backport: " + title;
            core.info(`Using title '${title}'`);
            const body = github.context.payload &&
                github.context.payload.pull_request &&
                github.context.payload.pull_request.body;
            core.info(`Using body '${body}'`);
            const pull = yield octokit.rest.pulls.create({
                owner,
                repo,
                head: prBranch,
                base: inputs.branch,
                title,
                body,
            });
            core.setOutput("cherry_pr_number", pull.data.number);
            core.setOutput("cherry_pr_url", pull.data.html_url);
            if (inputs.labels.length > 0) {
                core.info(`Applying labels '${inputs.labels}'`);
                yield octokit.rest.issues.addLabels({
                    owner,
                    repo,
                    issue_number: pull.data.number,
                    labels: inputs.labels,
                });
            }
            if (inputs.assignees.length > 0) {
                core.info(`Applying assignees '${inputs.assignees}'`);
                yield octokit.rest.issues.addAssignees({
                    owner,
                    repo,
                    issue_number: pull.data.number,
                    assignees: inputs.assignees,
                });
            }
            if (inputs.automerge) {
                try {
                    core.info(`Merging PR: #${pull.data.number} with method: '${inputs.mergeMethod}'`);
                    const res = yield octokit.rest.pulls.merge({
                        owner,
                        repo,
                        pull_number: pull.data.number,
                        merge_method: inputs.mergeMethod,
                    });
                    if (!res.data.merged) {
                        const msg = `Failure: Cherry pick [PR](${pull.data.html_url}) was created but cannot be merged`;
                        const detailedMsg = "Cherry-pick PR was created but cannot be merged: " +
                            res.data.message;
                        core.setOutput("error_message", msg);
                        core.error(detailedMsg);
                        core.setFailed(detailedMsg);
                        return;
                    }
                    core.info(`Cherry-pick PR was merged. Delete branch: ${prBranch}`);
                    octokit.rest.git.deleteRef({
                        owner,
                        repo,
                        ref: "heads/" + prBranch,
                    });
                }
                catch (e) {
                    const msg = `Failure: Cherry pick [PR](${pull.data.html_url}) was created but cannot be merged`;
                    const detailedMsg = "Cherry-pick PR was created but cannot be merged: " + e;
                    core.setOutput("error_message", msg);
                    core.error(detailedMsg);
                    core.setFailed(detailedMsg);
                    return;
                }
            }
        }
    });
}
exports.createPullRequest = createPullRequest;
