const dayjs = require('dayjs');
import { JiraProject } from './JiraProject';
import { GitHubIssues } from './GitHubIssues';

import * as yaml from 'js-yaml';
import * as fs from 'fs';

var relativeTime = require('dayjs/plugin/relativeTime')
dayjs.extend(relativeTime)

const GH_FIELD = 'customfield_21300';

var now = dayjs().subtract(3, 'month');

console.log(now.format('YYYY-MM-DD'));


//let limit = 1;

const DRY_RUN = false;

const STARTED = Date.now();

const MARKER_FILE = './.github-jira-sync';

console.log('SURE Jira <-> GitHub Report');

var dryRun = false;
var sync = false;

let csv = 'Issue,Title,Action,Version,Type,Priority,P#,JIRA Versions,Created,Age,GH Issue,GH State,GH Milestone,"GH Version"\n';

process.argv.forEach(function (val, index, array) {
  console.log(index + ': ' + val);
  if (val === '-d') {
    dryRun = true;
  }

  if (val === '-s') {
    sync = true;
  }
});

let configFileData;

const START_DATE = new Date();

const GITHUB_ISSUE_CUSTOM_FIELD_NAME = 'GitHub Issue';

// Get document, or throw exception on error
try {
  configFileData = yaml.safeLoad(fs.readFileSync('config.yaml', 'utf8'));
} catch (e) {
  console.log(e);
  process.exit(1);
}

const config = <any>configFileData;
//console.log(JSON.stringify(config, null, 2));

console.log(dryRun);
console.log(START_DATE);

const CSV_FILE = `report.csv`;

var jiraProject = new JiraProject(config);
var github = new GitHubIssues(config);

// var syncHelper = new SyncHelper(config, jiraProject, github);
// var webHooks = new WebHooks(config, syncHelper);

async function go() {
  await jiraProject.load(config.jira.projectKey);

  const issues = await jiraProject.getGitHubIssues(false, null, null);

  const gh = await github.getIssues(config.github.project);

  const mapped = gh.reduce((t, v) => {
    t[v.html_url] = v;
    return t;
  }, {});

  const versionCounts = {};

  jiraProject.issueCache.forEach((i) => {
    // const gh = jiraProject.getIssueField(i, 'Github Issue');
    const gh = i.fields.customfield_21300;
    const type = i.fields.issuetype.name;
    const fixVersions = (i.fields.fixVersions || []).map(v => v.name).join(',');
    const created = dayjs(i.fields.created);
    const age = created.fromNow(true);
    const priority = i.fields.priority.name;
    const pNum = jiraProject.mapPriority(priority);
    let ghState = '';
    let ghMilestone = '';
    let ghVersion = '';
    let action = '';
    const fixVersion = fixVersions.split(',')[0];
    let version = fixVersion

    if (gh) {
      const ghIssue = mapped[gh];

      if (ghIssue) {
        // console.log('Found GitHub issue for: ' + i.key);
        ghState = ghIssue.state;
        if (ghIssue.milestone) {
          ghMilestone = ghIssue.milestone.title;

          const prefix = config.github.versionPrefix ? `${config.github.versionPrefix} ` : '';

          if (ghMilestone) {
            if (ghMilestone.startsWith('v')) {
              ghMilestone = ghMilestone.substring(1);

              ghVersion = `${prefix}${ghMilestone}`;

              if (!fixVersion && ghVersion && ghState === 'closed') {
                action = 'RESOLVE';
                version = ghVersion;
              } else if (fixVersion && ghVersion && fixVersion !== ghVersion) {
                action = 'MISMATCH'
                version = '??';
              } else if (fixVersion && ghVersion && fixVersion === ghVersion && ghState === 'closed') {
                action = 'RESOLVE';
              } else if (!fixVersion && ghVersion) {
                action = "UPDATE VERSION";
                version = ghVersion;
              }
            }
          }
        }
      }
    }

    addCount(versionCounts, version, ghState === 'closed');

    csv += `${ i.key },"${ i.fields.summary }",${action},${ version },${ type },${ priority },${ pNum },"${ fixVersions }","${created}","${age}",${ gh },${ghState},${ghMilestone},${ghVersion}\n`;
  });

  // console.log(jiraProject.fields);

  // console.log(jiraProject.issueCache[0]);

  fs.writeFileSync(CSV_FILE, csv);

  // Output summary to console
  
  Object.keys(versionCounts).forEach((v) => {
    const info = versionCounts[v];
    console.log(`${v} : open: ${info.open}, closed: ${info.closed}`);
  });
}

go().then(() => {
  console.log('done');

  console.log(`Version: ${ jiraProject.versionCache.length }`);
});

// config.github.projects.forEach(prj => {
//   init.push(github.cacheNewIssues(prj.name, lastSyncDate));
//   init.push(github.cacheMilestones(prj.name));
//   init.push(github.cacheProjects(prj.name));
//   //init.push(github.cacheUpdatedIssues(prj.name, lastSyncDate));
// });

// const initialSync = Promise.all(init).then(() => {

//   var syncActions = [];
//   if (sync) {
//     syncActions.push(syncNewGitHubIssuesToJira);
//     //syncActions.push(syncNewJiraIssuesToGitHub);
//     syncActions.push(writeLastSyncMarkerFile);
//     console.log('Initialization complete ... syncing new issues');
//   }

//   return promiseSerial(syncActions).then(() => {
//     console.log('All done');

//     // Start web hook listener
//     webHooks.start();
//   }).catch((e) => {
//     console.log('Failed');
//     console.log(e);
//   })
// });

// initialSync.then(() => {
//   // Now start the WebHooks

// });

// function promiseSerial(funcs) {
//   return funcs.reduce((promise, func) =>
//     promise.then(result => func().then(Array.prototype.concat.bind(result))),
//     Promise.resolve([]));
// }


// function writeLastSyncMarkerFile() {
//   if (!DRY_RUN) {
//     fs.writeFileSync(MARKER_FILE, STARTED);
//   }
//   return Promise.resolve([]);
// }

// // Sync updates made in Jira and in GitHub
// function syncUpdates() {
//   const updates = [];
//   const skipGitHub = {};

//   console.log('Checking Updated JIRA issues: ' + jiraProject.updatedIssuesCache.length);

//   jiraProject.updatedIssuesCache.forEach(jiraIssue => {
//     // Check to see if the issue has been updated on GitHub during this sync window as well
//     const gitHubIssue = jiraProject.getIssueField(jiraIssue, GITHUB_ISSUE_CUSTOM_FIELD_NAME);
//     if (!!gitHubIssue) {
//       const ghIssue = github.updatedIssueCache[gitHubIssue];
//       if (!!ghIssue) {
//         console.log(jiraIssue.key + ' <--> ' + ghIssue.html_url);
//         console.log(' + Both the JIRA and GitHub issue have been updated during the sync window');
//         const ghIssueDate = Date.parse(ghIssue.updated_at);
//         const jiraIssueDate = Date.parse(jiraIssue.fields.updated);
//         if (jiraIssueDate > ghIssueDate) {
//           console.log(' + JIRA issue is newer');
//           skipGitHub[ghIssue.html_url] = ghIssue;
//           updates.push(syncHelper.updateGutHubIssueForJiraIssue(jiraIssue));
//         } else {
//           console.log(' + GitHub issue is newer');
//         }
//       } else {
//         console.log(jiraIssue.key + ' <--> ' + gitHubIssue);
//         console.log(' + JIRA issue updated (GitHub issue not updated)')
//       }
//     }
//   });

//   console.log('Checking Updated GitHub issues: ' + Object.keys(github.updatedIssueCache).length);
//   Object.keys(github.updatedIssueCache).forEach(ghIssueUrl => {
//     if (!skipGitHub[ghIssueUrl]) {
//       console.log(' + Syncing GitHub issue to JIRA: ' + ghIssueUrl);
//       updates.push(syncHelper.updateJiraIssueForGitHubIssue(github.updatedIssueCache[ghIssueUrl]));
//     } else {
//       console.log(' + Skipping GitHub issue: ' + ghIssueUrl);
//     }
//   });

//   return Promise.all(updates);
// }

// function syncNewGitHubIssuesToJira() {
//   let creates = [];

//   console.log(config.importFilter);
//   console.log('Syncing newly created GitHub issues to JIRA');
//   Object.keys(github.issueCache).forEach(prj => {
//     const gitHubIssues = github.issueCache[prj];
//     gitHubIssues.forEach(issue => {

//       let doImport = true;

//       // Import filter
//       if (!!config.importFilter) {
//         const importIssue = config.importFilter.findIndex(i => i === issue.html_url);
//         if (importIssue === -1) {
//           doImport = false;
//           console.log('-  Not importing: ' + issue.html_url + ' as it is not in the import filter');
//         } else {
//           console.log('+ Will importing: ' + issue.html_url);
//         }
//       }

//       if (doImport) {
//         const existing = syncHelper.getCachedJiraIssueForGitHubIssue(issue);
//         if (existing) {
//           console.log(' + Skipping GitHub Issue: ' + issue.html_url + ' - a JIRA issue already exists');
//         } else {
//           console.log(' + Creating Jira issue for GitHub issue: ' + issue.html_url);
//           creates.push(syncHelper.createJiraIssueForGitHubIssue(issue));
//         }
//       }
//     });
//   });

//   return Promise.all(creates);
// }

// function syncNewJiraIssuesToGitHub() {
//   let creates = [];
//   console.log('Syncing newly created JIRA issues to GitHub [' + jiraProject.issueCache.length + ']');
//   jiraProject.issueCache.forEach(issue => {
//     const project = syncHelper.getGitHubProjectForJiraIssue(issue);
//     if (!!project) {
//       // Need to create a GitHub issue
//       console.log(' + Creating GitHub issue for Jira issue: ' + issue.key);
//       creates.push(syncHelper.createGitHubIssueForJiraIssue(issue, project));
//     }
//   });

//   if (creates.length === 0) {
//     console.log( ' + Nothing to do');
//   }

//   return Promise.all(creates);
// }

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
