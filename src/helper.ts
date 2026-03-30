import * as core from "@actions/core";
import * as github from "@actions/github";


type Octokit = ReturnType<typeof github.getOctokit>;

/** release-1.67 → "1.67" */
function releaseVersionPrefixFromBranch(branch: string): string | null {
  const m = branch.trim().match(/^release-(\d+\.\d+)$/i);
  return m ? m[1]! : null;
}

/** "1.67.1", "v1.67.2" → [1,67,1]; otherwise null */
function parseThreePartVersion(
  title: string,
): [number, number, number] | null {
  const t = title.trim().replace(/^v/i, "");
  const m = t.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10)];
}

function compareSemverTriple(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

interface MilestoneForBranch {
  number: number;
  title: string;
}

/**
 * Open milestones whose title is major.minor.patch matching branch release-major.minor.
 */
async function listOpenMilestonesForReleaseBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<MilestoneForBranch[]> {
  const prefix = releaseVersionPrefixFromBranch(branch);
  if (!prefix) return [];

  const [wantMajor, wantMinor] = prefix.split(".").map((x) => parseInt(x, 10));

  const out: MilestoneForBranch[] = [];

  for await (const { data: milestones } of octokit.paginate.iterator(
    octokit.rest.issues.listMilestones,
    {
      owner,
      repo,
      state: "open",
      per_page: 100,
    },
  )) {
    for (const m of milestones) {
      if (m.number == null || !m.title) continue;
      const triple = parseThreePartVersion(m.title);
      if (!triple) continue;
      const [maj, min] = triple;
      if (maj !== wantMajor || min !== wantMinor) continue;
      out.push({ number: m.number, title: m.title });
    }
  }

  out.sort((x, y) =>
    compareSemverTriple(
      parseThreePartVersion(x.title)!,
      parseThreePartVersion(y.title)!,
    ),
  );

  return out;
}

/** Smallest patch among open milestones (e.g. 1.67.1 before 1.67.2). */
async function getFirstOpenMilestoneNumberForReleaseBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<number | null> {
  const list = await listOpenMilestonesForReleaseBranch(
    octokit,
    owner,
    repo,
    branch,
  );
  return list[0]?.number ?? null;
}

export interface Inputs {
  token: string;
  committer: string;
  author: string;
  branch: string;
  commit: string;
  labels: string[];
  automerge: boolean;
  mergeMethod: "merge" | "rebase" | "squash" | undefined;
  deleteMergeBranch: boolean;
  assignees: string[];
}

export async function createPullRequest(
  inputs: Inputs,
  prBranch: string,
): Promise<void> {
  const octokit = github.getOctokit(inputs.token);
  if (process.env.GITHUB_REPOSITORY !== undefined) {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

    // Get PR title
    let title =
      github.context.payload &&
      github.context.payload.pull_request &&
      github.context.payload.pull_request.title;
    // Get PR body

    let body =
      github.context.payload &&
      github.context.payload.pull_request &&
      github.context.payload.pull_request.body;

    if (!title || !body) {
      if (process.env.SOURCE_PR_NUMBER) {
        core.info(
          `Fetching title and body from source PR '${process.env.SOURCE_PR_NUMBER}'`,
        );
        try {
          const pull_number = parseInt(process.env.SOURCE_PR_NUMBER);
          const source_pr = await octokit.rest.pulls.get({
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
        } catch (e) {
          core.warning(`Failed to get source PR: ${e}`);
        }
      }
    }

    title = "Backport: " + title;
    //core.info(`Using title '${title}'`);
    //core.info(`Using body '${body}'`);

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

    // Milestone only for release base branches, e.g. release-1.67
    let milestoneNumber: number | null = null;
    if (releaseVersionPrefixFromBranch(inputs.branch) != null) {
      milestoneNumber = await getFirstOpenMilestoneNumberForReleaseBranch(
        octokit,
        owner,
        repo,
        inputs.branch,
      );
      if (milestoneNumber != null) {
        core.info(
          `Setting milestone #${milestoneNumber} on PR #${pull.data.number}`,
        );
        await octokit.rest.issues.update({
          owner,
          repo,
          issue_number: pull.data.number,
          milestone: milestoneNumber,
        });
      }
    }

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
          `Merging PR: #${pull.data.number} with method: '${inputs.mergeMethod}'`,
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

        if (inputs.deleteMergeBranch) {
          try {
            core.info(`Cherry-pick PR was merged. Delete branch: ${prBranch}`);
            octokit.rest.git.deleteRef({
              owner,
              repo,
              ref: "heads/" + prBranch,
            });
          } catch (e) {
            core.info(`PR branch ${prBranch} is already deleted`);
          }
        }
      } catch (e: any) {
        const msg = `Failure ⚠️: Cherry pick [PR](${pull.data.html_url}) was created but cannot be merged`;
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
