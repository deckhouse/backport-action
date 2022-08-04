# Changelog Action

This action creates merge PR with selected label to a release branch

This action will:
- Checkout triggered action.
- Create new branch name cherry-pick-${GITHUB_SHA} from branch input.
- Cherry-picking ${GITHUB_SHA} into created branch
- Push new branch to remote
- Open pull request to branch
- Automatically merge pull request if set

## How to use

```yaml
name: Run automatic cherry-pick on backport PRs

on:
  pull_request:
    types:
      - closed
    branches:
      - main
jobs:
  cherry_pick_backport:
    if: ${{ github.event.pull_request.merged == true }}
    runs-on: ubuntu-latest
    steps:
      - name: Cherry-pick
        uses: deckhouse/backport-action@master
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: "release-1.0"
          labels: auto-cherry-pick
          automerge: true
```

## License

Apache License Version 2.0