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
exports.run = run;
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const exec = __importStar(require("@actions/exec"));
const utils = __importStar(require("./utils"));
const github = __importStar(require("@actions/github"));
const helper_1 = require("./helper");
const CHERRYPICK_EMPTY = "The previous cherry-pick is now empty, possibly due to conflict resolution.";
const GIT_PUSH_WORKFLOW_CHECK_TIMEOUT = "due to timeout";
const GIT_PUSH_MAX_ATTEMPTS = 10;
const GIT_PUSH_RETRY_DELAY_MS = 5000;
function isGithubWorkflowPushTimeout(stderr) {
    return stderr.toLowerCase().includes(GIT_PUSH_WORKFLOW_CHECK_TIMEOUT);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const inputs = {
                token: core.getInput("token"),
                author: core.getInput("author"),
                branch: core.getInput("branch"),
                commit: core.getInput("commit"),
                labels: utils.getInputAsArray("labels"),
                automerge: core.getBooleanInput("automerge"),
                mergeMethod: utils.getInputMergeMethod("merge_method"),
                deleteMergeBranch: core.getBooleanInput("delete-merge-branch"),
                assignees: utils.getInputAsArray("assignees"),
                committer: core.getInput("committer"),
            };
            core.info(`Cherry pick into branch ${inputs.branch}!`);
            const githubSha = inputs.commit || process.env.GITHUB_SHA;
            const prBranch = `cherry-pick-${inputs.branch}-${githubSha}`;
            core.startGroup("Configuring the committer and author");
            const parsedAuthor = utils.parseDisplayNameEmail(inputs.author);
            const parsedCommitter = utils.parseDisplayNameEmail(inputs.committer);
            core.info(`Configured git committer as '${parsedCommitter.name} <${parsedCommitter.email}>'`);
            yield gitExec(["config", "--global", "user.name", parsedAuthor.name]);
            yield gitExec(["config", "--global", "user.email", parsedAuthor.email]);
            core.endGroup();
            core.startGroup("Fetch all branchs");
            yield gitExec(["remote", "update"]);
            yield gitExec(["fetch", "--all"]);
            core.endGroup();
            core.startGroup(`Create new branch from ${inputs.branch}`);
            yield gitExec(["checkout", "-b", prBranch, `origin/${inputs.branch}`]);
            core.endGroup();
            core.startGroup("Cherry picking");
            core.info(`picking commit: ${githubSha}`);
            const result = yield gitExec(["cherry-pick", `${githubSha}`]);
            if (result.exitCode !== 0 && !result.stderr.includes(CHERRYPICK_EMPTY)) {
                const msg = `Failure: cherry-pick commit ${githubSha} to the branch [${inputs.branch}](${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/tree/${inputs.branch}) failed. See [Job](${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}) for details.`;
                core.setOutput("error_message", msg);
                throw new Error(`Cherry-pick error: ${result.stderr}`);
            }
            core.endGroup();
            core.startGroup("Push new branch to remote");
            let pushResult = yield gitExec(["push", "-u", "origin", `${prBranch}`], { liveOutput: true });
            let pushAttempt = 1;
            while (pushResult.exitCode !== 0 &&
                pushAttempt < GIT_PUSH_MAX_ATTEMPTS &&
                isGithubWorkflowPushTimeout(pushResult.stderr)) {
                core.warning(`git push failed (attempt ${pushAttempt}/${GIT_PUSH_MAX_ATTEMPTS}): workflow check timed out on GitHub; retrying in ${GIT_PUSH_RETRY_DELAY_MS / 1000}s`);
                yield sleep(GIT_PUSH_RETRY_DELAY_MS);
                pushAttempt++;
                pushResult = yield gitExec(["push", "-u", "origin", `${prBranch}`], { liveOutput: true });
            }
            core.endGroup();
            if (pushResult.exitCode !== 0) {
                throw new Error(`git push failed (exit ${pushResult.exitCode}); branch "${prBranch}" is not on the remote, so GitHub rejects head="${prBranch}" when creating the PR.\n${pushResult.stderr.trim()}`);
            }
            core.startGroup("Opening pull request with cherry-pick");
            yield (0, helper_1.createPullRequest)(inputs, prBranch);
            core.endGroup();
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
function gitExec(params, execOpts) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = new GitOutput();
        const stdout = [];
        const stderr = [];
        core.info(`git argv: ${JSON.stringify(params)}`);
        const started = Date.now();
        const options = {
            ignoreReturnCode: true,
            listeners: {
                stdout: (data) => {
                    stdout.push(data.toString());
                    if (execOpts === null || execOpts === void 0 ? void 0 : execOpts.liveOutput) {
                        process.stdout.write(data);
                    }
                },
                stderr: (data) => {
                    stderr.push(data.toString());
                    if (execOpts === null || execOpts === void 0 ? void 0 : execOpts.liveOutput) {
                        process.stderr.write(data);
                    }
                },
            },
        };
        const gitPath = yield io.which("git", true);
        result.exitCode = yield exec.exec(gitPath, params, options);
        result.stdout = stdout.join("");
        result.stderr = stderr.join("");
        const elapsedMs = Date.now() - started;
        core.info(`git finished in ${elapsedMs}ms, exit code ${result.exitCode}, cwd ${process.cwd()}`);
        if (result.exitCode === 0) {
            if (!(execOpts === null || execOpts === void 0 ? void 0 : execOpts.liveOutput) && result.stdout.trim()) {
                core.info(result.stdout.trim());
            }
        }
        else {
            core.info(`--- git stderr (${result.stderr.length} bytes) ---`);
            core.info(result.stderr.trim() || "(empty)");
            core.info(`--- git stdout (${result.stdout.length} bytes) ---`);
            core.info(result.stdout.trim() || "(empty)");
        }
        return result;
    });
}
class GitOutput {
    constructor() {
        this.stdout = "";
        this.stderr = "";
        this.exitCode = 0;
    }
}
run();
