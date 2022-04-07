# GitHub Jira Report

Simple tool for combining issue data from JIRA and GitHub to geenrate a combined report.

This tool will retrieve issues from a JIRA system, retrieve issues from GitHub and geenrate a CSV report file combining thw two data sources, linking issues via a custom field on the JIRA issues which links to the corresponding GitHub issue.


## Requirements

You need a recent installation of `nodejs`.

## Running

- Clone this repository
- Install node dependencies by running `npm install` (you only need to do this once)
- Ensure you have created a `config.yaml` configuration file (see below)
- Run `npm run report` to run the tool and generate the report file

The resulting report CSV file will be written to the current directory and named `report.csv`.

By default, only JIRA issues that have a linked GitHub issue will be included in the report - to include all JIRA issues, run with the additional `-a` flag - e.g. `npm run report -- -a` (note: the `--` before the -a arg is required)

## Configuration

A file in the top-level folder named `config.yaml` is required to configure this tool before running.

Example:

```
jira:
  projectKey: <Project Key>
  host: <Jira Server>
  username: <Jira Username>
  password: <Jira Password>
  components: <Optional components to filter by>

github:
  token: <API Token>
  versionPrefix: <Version prefix>
```

> Note: versionPrefix provides for mapping from GitHub milestones to versions in JIRA. For example, if the GitHub milestone is `v2.5.6` and the corresponding JIRA version is `PRODUCT 2.5.6` then use a `versionPrefix` of `PRODUCT`. Note this tool will remove a `v` prefix from the GitHub milestone.

> Note: You should create a GitHub token with read-only permissions - if you have private repositories referenced in yuor JIRA issues, ensure you give the token access to private repositories

## Output

The Output CSV contains a set of columns that should be self-explanatory - a few notes:

- Action - This column includes a suggested action to be taken to rectify discrepancies between JIRA and GitHub - this can be:
  - GITHUB STALE - The linked GitHub issue has been marked as stale and closed
  - GITHUB MISSING - The linked GitHub issue could not be found - NOTE: if an issue has been transferred to another repository the redirect is not followed by this tool and will show as GITHUB_MISSING
  - UPDATE_VERSION - The version in JIRA needs to be upadted to reflect the version on the linked GitHub issue
  - MISMATCH - There is a mismatch between the version in JIRA and GitHub
  - RESOLVE - The JIRA issue can potentially marked as resolved as the linked GitHub issue has been closed
  - ADD GITHUB - There is no linked GitHub issue for the JIRA issue

- Version - This shows the combined version for the issue - this will pick whichver of the JIRA and GitHub versions is not empty. If both are set to the same version then this shows this value. If both are set but different, this shows `??` and the action is set to `MISMATCH`.

- P# - This is a numeric value for the issue priority that makes it easier to sort by priority - the default order is:
  - Blocker (1), Crit (2), Urgent (3), High (4), Medium (5), Low (6), Lowest (7),  Minor (8)
  


