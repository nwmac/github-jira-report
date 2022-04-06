# GitHub Jira Report

Simple tool for combining issue data from JIRA and GitHub to geenrate a combined report.

This tool will retrieve issues from a JIRA system, retrieve issues from GitHub and geenrate a CSV report file combining thw two data sources, linking issues via a custom field on the JIRA issues which links to the corresponding GitHub issue.


## Requirements

You need a recent installation of `nodejs`.

## Running

- Clone this repository
- Install node dependencies by running `npm install` (you only need to do this once)
- Ensure you have created a `config.yaml` configuration file (see below)
- Run `npm run reprt` to run the tool and generate the report file

The resulting report CSV file will be written to the current directort and named `report.csv`.

## Configuration

A file in the top-level folder named `config.yaml` is required to configure this tool before running.

Example:

```
jira:
  projectKey: <Project Key>
  host: <Jira Server>
  username: <Jira Username>
  password: <Jira Password>
  components: <Component to filter by>
  priorities:
  - Blocker
  - Crit
  - Urgent
  - High
  - Medium
  - Low
  - Lowest
  - Minor

github:
  token: <API Token>
  versionPrefix: <Version prefix>
```
