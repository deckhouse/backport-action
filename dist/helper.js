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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPullRequest = createPullRequest;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
function releaseVersionPrefixFromBranch(branch) {
    const m = branch.trim().match(/^release-(\d+\.\d+)$/i);
    return m ? m[1] : null;
}
function parseThreePartVersion(title) {
    const t = title.trim().replace(/^v/i, "");
    const m = t.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m)
        return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}
function compareSemverTriple(a, b) {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i])
            return a[i] - b[i];
    }
    return 0;
}
function listOpenMilestonesForReleaseBranch(octokit, owner, repo, branch) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        const prefix = releaseVersionPrefixFromBranch(branch);
        if (!prefix)
            return [];
        const [wantMajor, wantMinor] = prefix.split(".").map((x) => parseInt(x, 10));
        const out = [];
        try {
            for (var _d = true, _e = __asyncValues(octokit.paginate.iterator(octokit.rest.issues.listMilestones, {
                owner,
                repo,
                state: "open",
                per_page: 100,
            })), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const { data: milestones } = _c;
                for (const m of milestones) {
                    if (m.number == null || !m.title)
                        continue;
                    const triple = parseThreePartVersion(m.title);
                    if (!triple)
                        continue;
                    const [maj, min] = triple;
                    if (maj !== wantMajor || min !== wantMinor)
                        continue;
                    out.push({ number: m.number, title: m.title });
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
            }
            finally { if (e_1) throw e_1.error; }
        }
        out.sort((x, y) => compareSemverTriple(parseThreePartVersion(x.title), parseThreePartVersion(y.title)));
        return out;
    });
}
function getFirstOpenMilestoneNumberForReleaseBranch(octokit, owner, repo, branch) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const list = yield listOpenMilestonesForReleaseBranch(octokit, owner, repo, branch);
        return (_b = (_a = list[0]) === null || _a === void 0 ? void 0 : _a.number) !== null && _b !== void 0 ? _b : null;
    });
}
function createPullRequest(inputs, prBranch) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = github.getOctokit(inputs.token);
        if (process.env.GITHUB_REPOSITORY !== undefined) {
            const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
            let title = github.context.payload &&
                github.context.payload.pull_request &&
                github.context.payload.pull_request.title;
            let body = github.context.payload &&
                github.context.payload.pull_request &&
                github.context.payload.pull_request.body;
            if (!title || !body) {
                if (process.env.SOURCE_PR_NUMBER) {
                    core.info(`Fetching title and body from source PR '${process.env.SOURCE_PR_NUMBER}'`);
                    try {
                        const pull_number = parseInt(process.env.SOURCE_PR_NUMBER);
                        const source_pr = yield octokit.rest.pulls.get({
                            owner,
                            repo,
                            pull_number: pull_number,
                        });
                        if (!title) {
                            title = source_pr.data.title;
                        }
                        if (!body) {
                            body = source_pr.data.body || "";
                        }
                    }
                    catch (e) {
                        core.warning(`Failed to get source PR: ${e}`);
                    }
                }
            }
            title = "Backport: " + title;
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
            let milestoneNumber = null;
            if (releaseVersionPrefixFromBranch(inputs.branch) != null) {
                milestoneNumber = yield getFirstOpenMilestoneNumberForReleaseBranch(octokit, owner, repo, inputs.branch);
                if (milestoneNumber != null) {
                    core.info(`Setting milestone #${milestoneNumber} on PR #${pull.data.number}`);
                    yield octokit.rest.issues.update({
                        owner,
                        repo,
                        issue_number: pull.data.number,
                        milestone: milestoneNumber,
                    });
                }
            }
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
                    if (inputs.deleteMergeBranch) {
                        try {
                            core.info(`Cherry-pick PR was merged. Delete branch: ${prBranch}`);
                            octokit.rest.git.deleteRef({
                                owner,
                                repo,
                                ref: "heads/" + prBranch,
                            });
                        }
                        catch (e) {
                            core.info(`PR branch ${prBranch} is already deleted`);
                        }
                    }
                }
                catch (e) {
                    const msg = `Failure ⚠️: Cherry pick [PR](${pull.data.html_url}) was created but cannot be merged`;
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
