const dayjs = require('dayjs');
import { JiraProject } from './JiraProject';
import { GitHubIssues } from './GitHubIssues';

import * as yaml from 'js-yaml';
import * as fs from 'fs';

var relativeTime = require('dayjs/plugin/relativeTime')
dayjs.extend(relativeTime)

// Not used
const GITHUB_ISSUE_CUSTOM_FIELD_NAME = 'GitHub Issue';

var now = dayjs().subtract(3, 'month');

const DRY_RUN = false;

const STARTED = Date.now();

const MARKER_FILE = './.github-jira-sync';

console.log('===========================');
console.log('SURE Jira <-> GitHub Report');
console.log('===========================');

let csv = 'Issue,Title,Action,Version,JIRA Versions,"GH Version",Type,Priority,P#,Created,Age,GH Issue,GH State,GH Milestone,GH Labels\n';

let configFileData;

const START_DATE = new Date();

let ALL = false;

const DEFAULT_JIRA_CONFIG = {
  "priorities": [
    "Blocker",
    "Crit",
    "Urgent",
    "High",
    "Medium",
    "Low",
    "Lowest",
    "Minor"
  ]
};

if (process.argv.length === 3 && process.argv[2] === '-a') {
  ALL = true;

  console.log('Including all issues (+ those without linked GitHub issues)')
}

// Get document, or throw exception on error
try {
  configFileData = yaml.load(fs.readFileSync('config.yaml', 'utf8'));
} catch (e) {
  console.log(e);
  process.exit(1);
}

configFileData = {
  jira: {
    ...DEFAULT_JIRA_CONFIG,
    ...configFileData.jira
  },
  github: {
    ...configFileData.github
  }
};

const config = <any>configFileData;
//console.log(JSON.stringify(config, null, 2));

const CSV_FILE = `report.csv`;

var jiraProject = new JiraProject(config, ALL);
var github = new GitHubIssues(config);

async function go() {
  await jiraProject.load(config.jira.projectKey);
  await jiraProject.getGitHubIssues(false, null, null);

  console.log(`JIRA Issues retrieved: ${jiraProject.issueCache.length}`);

  // Go through all of the issues and find all of the GitHub projects that we need to fetch issues for
  const mapped = await github.getSpecificIssues(jiraProject.issueCache, jiraProject.gitHubField);
  const versionCounts = {};

  jiraProject.issueCache.forEach((i) => {
    let gh = i.fields[jiraProject.gitHubField];
    const type = i.fields.issuetype.name;
    const fixVersions = (i.fields.fixVersions || []).map(v => v.name).join(',');
    const created = dayjs(i.fields.created);
    const age = created.fromNow(true);
    const priority = i.fields.priority.name;
    const pNum = jiraProject.mapPriority(priority);
    let ghMilestone = '';
    let ghVersion = '';
    let action = '';
    const fixVersion = fixVersions.split(',')[0];
    let version = fixVersion
    let closed = false;
    let ghLabels = '';

    if (gh) {
      const ghIssue = mapped[gh];

      if (ghIssue) {
        closed = ghIssue.closed;

        if (ghIssue.labels) {
          ghLabels = ghIssue.labels.join(',');
        }

        if (ghIssue.milestone) {
          ghMilestone = ghIssue.milestone;

          const prefix = config.github.versionPrefix ? `${config.github.versionPrefix} ` : '';

          if (ghMilestone) {
            if (ghMilestone.startsWith('v')) {
              ghVersion = `${prefix}${ghMilestone.substring(1)}`;

              if (!fixVersion && ghVersion && ghIssue.closed) {
                action = 'RESOLVE';
                version = ghVersion;
              } else if (fixVersion && ghVersion && fixVersion !== ghVersion) {
                action = 'MISMATCH'
                version = '??';
              } else if (fixVersion && ghVersion && fixVersion === ghVersion && ghIssue.closed) {
                action = 'RESOLVE';
              } else if (!fixVersion && ghVersion) {
                action = "UPDATE VERSION";
                version = ghVersion;
              }
            }
          }
        } else if (closed) {
          action = 'GITHUB CLOSED';

          if (ghIssue.labels && ghIssue.labels.includes('status/stale')) {
            action = 'GITHUB STALE';
          }
        }
      } else {
        action = 'GITHUB MISSING';
      }
    } else {
      gh = '';
      action = 'ADD GITHUB';
    }

    addCount(versionCounts, version || '<None>', closed);

    const state = closed ? 'Closed' : 'Open';

    csv += `${ i.key },"${ i.fields.summary }",${action},${ version },"${ fixVersions }",${ghVersion},${ type },${ priority },${ pNum },"${created}","${age}",${ gh },${state},${ghMilestone},"${ ghLabels }"\n`;
  });

  fs.writeFileSync(CSV_FILE, csv);

  // Output summary to console

  let vLen = 0;

  Object.keys(versionCounts).forEach((v) => {
    if (v.length > vLen) {
      vLen = v.length;
    }
  });

  vLen += 4;

  console.log('');
  console.log(`${'Version'.padEnd(vLen)}  Open    Closed`)
  console.log(`${'======='.padEnd(vLen)}  ======  ======`)
    
  Object.keys(versionCounts).forEach((v) => {
    const info = versionCounts[v];
    const open = info.open.toString().padEnd(6);
    const closed = info.closed.toString().padEnd(6);
    console.log(`${v.padEnd(vLen)}  ${open}  ${closed}`);
  });

  console.log('');
}

go();

function addCount(versionCounts, version, closed) {
  if (!versionCounts[version]) {
    versionCounts[version] = {
      open: 0,
      closed: 0
    };
  }

  if (!closed) {
    versionCounts[version].open = versionCounts[version].open +1;
  } else {
    versionCounts[version].closed = versionCounts[version].closed +1;
  }
}
