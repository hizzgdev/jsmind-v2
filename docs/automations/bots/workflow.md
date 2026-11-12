# jsMind-V2 Bot Collaboration Workflow

Three bots collaborate through GitHub labels and events to handle development, review, and cleanup.

## Roles

- **Gobe**: Developer. Implements features and fixes bugs.
- **Bobo**: Reviewer. Performs code review.
- **Cleo**: Cleanup. Removes the worktree after a PR is merged.

## Workflow

1. **Start**  
   Add the label `gobe:request` to an issue to trigger Gobe.

2. **Development**  
   Gobe adds `gobe:working`, makes changes in a dedicated worktree, creates or updates the PR, then removes `gobe:working` and adds `gobe:ready`.

3. **Review**  
   The label `gobe:ready` triggers Bobo. Bobo reviews the PR and submits a COMMENT-type review:
   - Approved: removes `gobe:ready`, adds `bobo:approve`, and comments “Ready to merge.”
   - Changes requested: removes `gobe:ready`, adds `bobo:request-change`, and lists the issues.

4. **Revision**  
   The label `bobo:request-change` triggers Gobe again. After fixing, Gobe adds `gobe:ready` for another review cycle.

5. **Cleanup**  
   When the PR is merged, Cleo is triggered. Cleo finds and safely removes the corresponding worktree, then leaves a cleanup comment on the issue.

## Labels

| Label | Meaning | Triggers |
|-------|---------|----------|
| `gobe:request` | Request development | Gobe |
| `gobe:working` | Work in progress | — |
| `gobe:ready` | Ready for review | Bobo |
| `bobo:request-change` | Changes needed | Gobe |
| `bobo:approve` | Approved, ready to merge | — |

The entire flow is driven by label changes and the pull request merged event. Comment content is not used for control.
