import * as core from "@actions/core";
import * as io from "@actions/io";
import * as exec from "@actions/exec";
import * as utils from "./utils";
import * as github from "@actions/github";
import { Inputs, createPullRequest } from "./helper";
import { ExecOptions } from "@actions/exec";

const CHERRYPICK_EMPTY =
  "The previous cherry-pick is now empty, possibly due to conflict resolution.";

/** GitHub may reject push while checking workflow updates; transient server timeouts mention this phrase. */
const GIT_PUSH_WORKFLOW_CHECK_TIMEOUT = "due to timeout";
const GIT_PUSH_MAX_ATTEMPTS = 50;
const GIT_PUSH_RETRY_DELAY_MS = 5000;

function isGithubWorkflowPushTimeout(stderr: string): boolean {
  return stderr.toLowerCase().includes(GIT_PUSH_WORKFLOW_CHECK_TIMEOUT);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HTTPS URL so fetch/push use the same token as Octokit (checkout often leaves `origin` on default GITHUB_TOKEN only). */
function originUrlWithToken(token: string): string {
  const { owner, repo } = github.context.repo;
  const base = process.env.GITHUB_SERVER_URL || "https://github.com";
  const { host } = new URL(base.endsWith("/") ? base.slice(0, -1) : base);
  return `https://x-access-token:${token}@${host}/${owner}/${repo}.git`;
}

/** Files in this push vs `origin/<branch>`; explains GitHub workflow validation on push. */
async function logPushPayloadVsBase(branch: string): Promise<void> {
  const baseRef = `origin/${branch}`;
  const range = `${baseRef}..HEAD`;

  const commits = await gitExec(["log", "--oneline", "--no-decorate", range], {
    quiet: true,
  });
  const names = await gitExec(
    ["diff", "--name-only", `${baseRef}...HEAD`],
    { quiet: true }
  );

  if (commits.exitCode !== 0) {
    core.warning(
      `Could not list commits (${baseRef}..HEAD): ${commits.stderr.trim()}`
    );
  }
  if (names.exitCode !== 0) {
    core.warning(
      `Could not list changed files (${baseRef}...HEAD): ${names.stderr.trim()}`
    );
  }

  core.info(`Commits on branch not in ${baseRef}:`);
  core.info(commits.stdout.trim() || "(none)");
  core.info(`Files changed vs merge-base (${baseRef}...HEAD):`);
  const paths = names.stdout
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
  if (paths.length === 0) {
    core.info("(none — unexpected before push)");
  } else {
    core.info(paths.join("\n"));
  }

  const workflowPaths = paths.filter((p) =>
    p.startsWith(".github/workflows/")
  );
  if (workflowPaths.length > 0) {
    core.warning(
      `Push touches ${workflowPaths.length} workflow file(s). GitHub runs extra checks on the server; ` +
        `"due to timeout" or workflows scope errors are common here. Use a token with Workflows permission or split workflow changes from the backport.`
    );
    core.info(`Workflow paths: ${workflowPaths.join(", ")}`);
  } else if (paths.length > 0 && names.exitCode === 0) {
    core.info(
      "No `.github/workflows/` paths in this diff; if push still fails with a workflow/timeout message, it can be a transient GitHub check or missing Workflows token scope anyway."
    );
  }
}

export async function run(): Promise<void> {
  try {
    const inputs: Inputs = {
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

    if (inputs.token) {
      core.setSecret(inputs.token);
    }

    core.startGroup("Point origin at repo using action token");
    await gitExec(["remote", "set-url", "origin", originUrlWithToken(inputs.token)]);
    core.endGroup();

    const githubSha = inputs.commit || process.env.GITHUB_SHA;
    const prBranch = `cherry-pick-${inputs.branch}-${githubSha}`;

    // Configure the committer and author
    core.startGroup("Configuring the committer and author");
    const parsedAuthor = utils.parseDisplayNameEmail(inputs.author);
    const parsedCommitter = utils.parseDisplayNameEmail(inputs.committer);
    core.info(
      `Configured git committer as '${parsedCommitter.name} <${parsedCommitter.email}>'`
    );
    await gitExec(["config", "--global", "user.name", parsedAuthor.name]);
    await gitExec(["config", "--global", "user.email", parsedAuthor.email]);
    core.endGroup();

    // Update branches
    core.startGroup("Fetch all branchs");
    await gitExec(["remote", "update"]);
    await gitExec(["fetch", "--all"]);
    core.endGroup();

    // Create branch new branch
    core.startGroup(`Create new branch from ${inputs.branch}`);
    await gitExec(["checkout", "-b", prBranch, `origin/${inputs.branch}`]);
    core.endGroup();

    // Cherry pick
    core.startGroup("Cherry picking");
    core.info(`picking commit: ${githubSha}`);
    const result = await gitExec(["cherry-pick", `${githubSha}`]);
    if (result.exitCode !== 0 && !result.stderr.includes(CHERRYPICK_EMPTY)) {
      const msg = `Failure: cherry-pick commit ${githubSha} to the branch [${inputs.branch}](${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/tree/${inputs.branch}) failed. See [Job](${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}) for details.`;
      core.setOutput("error_message", msg);
      throw new Error(`Cherry-pick error: ${result.stderr}`);
    }
    core.endGroup();

    // Push new branch (retry on GitHub-side workflow validation timeout)
    core.startGroup("Push new branch to remote");
    core.startGroup("What will be pushed (vs target branch)");
    await logPushPayloadVsBase(inputs.branch);
    core.endGroup();

    let pushResult = await gitExec(
      ["push", "-u", "origin", `${prBranch}`],
      { liveOutput: true }
    );
    let pushAttempt = 1;
    while (
      pushResult.exitCode !== 0 &&
      pushAttempt < GIT_PUSH_MAX_ATTEMPTS &&
      isGithubWorkflowPushTimeout(pushResult.stderr)
    ) {
      core.warning(
        `git push failed (attempt ${pushAttempt}/${GIT_PUSH_MAX_ATTEMPTS}): workflow check timed out on GitHub; retrying in ${GIT_PUSH_RETRY_DELAY_MS / 1000}s`
      );
      await sleep(GIT_PUSH_RETRY_DELAY_MS);
      pushAttempt++;
      pushResult = await gitExec(
        ["push", "-u", "origin", `${prBranch}`],
        { liveOutput: true }
      );
    }
    core.endGroup();
    if (pushResult.exitCode !== 0) {
      throw new Error(
        `git push failed (exit ${pushResult.exitCode}); branch "${prBranch}" is not on the remote, so GitHub rejects head="${prBranch}" when creating the PR.\n${pushResult.stderr.trim()}`
      );
    }

    // Create pull request
    core.startGroup("Opening pull request with cherry-pick");
    await createPullRequest(inputs, prBranch);
    core.endGroup();
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

type GitExecOptions = {
  /** Echo stdout/stderr as git writes (useful for long push / server-side delays). */
  liveOutput?: boolean;
  /** No argv/duration/success logs (for nested diagnostic git calls). */
  quiet?: boolean;
};

async function gitExec(
  params: string[],
  execOpts?: GitExecOptions
): Promise<GitOutput> {
  const result = new GitOutput();
  const stdout: string[] = [];
  const stderr: string[] = [];

  if (!execOpts?.quiet) {
    core.info(`git argv: ${JSON.stringify(params)}`);
  }
  const started = Date.now();

  const options: ExecOptions = {
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout.push(data.toString());
        if (execOpts?.liveOutput) {
          process.stdout.write(data);
        }
      },
      stderr: (data: Buffer) => {
        stderr.push(data.toString());
        if (execOpts?.liveOutput) {
          process.stderr.write(data);
        }
      },
    },
  };

  const gitPath = await io.which("git", true);
  result.exitCode = await exec.exec(gitPath, params, options);
  result.stdout = stdout.join("");
  result.stderr = stderr.join("");

  const elapsedMs = Date.now() - started;
  if (!execOpts?.quiet) {
    core.info(
      `git finished in ${elapsedMs}ms, exit code ${result.exitCode}, cwd ${process.cwd()}`
    );
  }

  if (result.exitCode === 0) {
    if (
      !execOpts?.quiet &&
      !execOpts?.liveOutput &&
      result.stdout.trim()
    ) {
      core.info(result.stdout.trim());
    }
  } else {
    if (execOpts?.liveOutput) {
      core.info(
        `git stderr was streamed above (${result.stderr.length} bytes); stdout ${result.stdout.length} bytes`
      );
    } else {
      core.info(`--- git stderr (${result.stderr.length} bytes) ---`);
      core.info(result.stderr.trim() || "(empty)");
      core.info(`--- git stdout (${result.stdout.length} bytes) ---`);
      core.info(result.stdout.trim() || "(empty)");
    }
  }

  return result;
}

class GitOutput {
  stdout = "";
  stderr = "";
  exitCode = 0;
}

run();
