import * as github from "@actions/github";
import * as core from "@actions/core";

export interface Inputs {
  token: string;
  committer: string;
  author: string;
  branch: string;
  commit: string;
  labels: string[];
  automerge: boolean;
  mergeMethod: "merge" | "rebase" | "squash" | undefined;
  assignees: string[];
}

export async function createPullRequest(
  inputs: Inputs,
  prBranch: string
): Promise<void> {
  const octokit = github.getOctokit(inputs.token);
  if (process.env.GITHUB_REPOSITORY !== undefined) {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

    // Get PR title
    let title =
      github.context.payload &&
      github.context.payload.pull_request &&
      github.context.payload.pull_request.title;
    title = "Backport: " + title;
    core.info(`Using title '${title}'`);

    // Get PR body
    const body =
      github.context.payload &&
      github.context.payload.pull_request &&
      github.context.payload.pull_request.body;
    core.info(`Using body '${body}'`);

    // Create PR
    const pull = await octokit.rest.pulls.create({
      owner,
      repo,
      head: prBranch,
      base: inputs.branch,
      title,
      body,
    });
    core.setOutput("cherry_pr_number", pull.data.number);
    core.setOutput("cherry_pr_url", pull.data.html_url);

    // Apply labels
    if (inputs.labels.length > 0) {
      // don't think we have to inherit labels

      // const prLabels =
      //     github.context.payload &&
      //     github.context.payload.pull_request &&
      //     github.context.payload.pull_request.labels
      //
      // if (prLabels) {
      //     for (const item of prLabels) {
      //         if (item.name !== inputs.branch) {
      //             inputs.labels.push(item.name)
      //         }
      //     }
      // }

      core.info(`Applying labels '${inputs.labels}'`);
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pull.data.number,
        labels: inputs.labels,
      });
    }

    // Apply assignees
    if (inputs.assignees.length > 0) {
      core.info(`Applying assignees '${inputs.assignees}'`);
      await octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: pull.data.number,
        assignees: inputs.assignees,
      });
    }

    // automerge PR
    if (inputs.automerge) {
      try {
        core.info(
          `Merging PR: #${pull.data.number} with method: '${inputs.mergeMethod}'`
        );
        const res = await octokit.rest.pulls.merge({
          owner,
          repo,
          pull_number: pull.data.number,
          merge_method: inputs.mergeMethod,
        });

        if (!res.data.merged) {
          const msg = `Failure: Cherry pick [PR](${pull.data.html_url}) was created but cannot be merged`;
          const detailedMsg =
            "Cherry-pick PR was created but cannot be merged: " +
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
      } catch (e: any) {
        const msg = `Failure: Cherry pick [PR](${pull.data.html_url}) was created but cannot be merged`;
        const detailedMsg =
            "Cherry-pick PR was created but cannot be merged: " + e;
        core.setOutput("error_message", msg);
        core.error(detailedMsg);
        core.setFailed(detailedMsg);
        return;
      }
    }
  }
}
