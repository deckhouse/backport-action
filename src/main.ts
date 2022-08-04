import * as core from "@actions/core";
import * as io from "@actions/io";
import * as exec from "@actions/exec";
import * as utils from "./utils";
import * as github from "@actions/github";
import { Inputs, createPullRequest } from "./helper";
import { ExecOptions } from "@actions/exec";

const CHERRYPICK_EMPTY =
  "The previous cherry-pick is now empty, possibly due to conflict resolution.";

export async function run(): Promise<void> {
  try {
    const inputs: Inputs = {
      token: core.getInput("token"),
      author: core.getInput("author"),
      branch: core.getInput("branch"),
      labels: utils.getInputAsArray("labels"),
      automerge: core.getBooleanInput("automerge"),
      mergeMethod: utils.getInputMergeMethod("mergeMethod"),
      assignees: utils.getInputAsArray("assignees"),
      committer: core.getInput("committer"),
    };

    core.info(`Cherry pick into branch ${inputs.branch}!`);

    const githubSha = process.env.GITHUB_SHA;
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
      core.setOutput("error-message", msg);
      throw new Error(`Cherry-pick error: ${result.stderr}`);
    }
    core.endGroup();

    // Push new branch
    core.startGroup("Push new branch to remote");
    await gitExec(["push", "-u", "origin", `${prBranch}`]);
    core.endGroup();

    // Create pull request
    core.startGroup("Opening pull request with cherry-pick");
    await createPullRequest(inputs, prBranch);
    core.endGroup();
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

async function gitExec(params: string[]): Promise<GitOutput> {
  const result = new GitOutput();
  const stdout: string[] = [];
  const stderr: string[] = [];

  const options: ExecOptions = {
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout.push(data.toString());
      },
      stderr: (data: Buffer) => {
        stderr.push(data.toString());
      },
    },
  };

  const gitPath = await io.which("git", true);
  result.exitCode = await exec.exec(gitPath, params, options);
  result.stdout = stdout.join("");
  result.stderr = stderr.join("");

  if (result.exitCode === 0) {
    core.info(result.stdout.trim());
  } else {
    core.info(result.stderr.trim());
  }

  return result;
}

class GitOutput {
  stdout = "";
  stderr = "";
  exitCode = 0;
}

run();
