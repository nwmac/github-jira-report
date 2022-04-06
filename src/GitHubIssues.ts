const dayjs = require('dayjs');

const { Octokit } = require('@octokit/rest');

class GitHubIssues {
  config: any;
  octokit: any;
  project: any;
  fields: any;
  users: any;
  sprints: any;
  activeSprint: any;
  public sprintsMap: any;
  public sprintIssues: any;
  public issueCache = {};

  // Map of Issue ID to issue for updated issues
  public updatedIssueCache = {};

  public milestoneCache = {};

  public projectCache = {};

  constructor(config: any) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.github.token
    });
  }

  getIssueByURL(url: string) {
    const GITHUB_PREFIX = 'https://github.com/';
    if (url.indexOf(GITHUB_PREFIX) === 0) {
      url = url.substr(GITHUB_PREFIX.length);
    }

    const parts = url.split('/');
    return this.octokit.issues.get({
      owner: parts[0],
      repo: parts[1],
      issue_number: parts[3]
    });
  }

  getIssues(project: string) {
    const dateField = 'updated';
    const startDate = dayjs().subtract(3, 'month').format('YYYY-MM-DD');
    let q = `repo:${project}+type:issue`;
  
    q += `+${dateField}:>${startDate}`;

    const options = this.octokit.search.issuesAndPullRequests.endpoint.merge({q: q, sort: dateField});

    console.log('GitHub: Fetching ' + dateField + ' issues for project: ' + project);
    return this.octokit.paginate(options)
      .then(issues => {
        // // issues is an array of all issue objects
        // let normalized = [];
        // issues.forEach(page => {
        //   normalized = normalized.concat(page.items);
        // });
        const normalized = issues;
        console.log('GitHub: Fetched ' + dateField + ' issues for project: ' + project + ' [' + normalized.length + ']');
        return normalized;
      }).catch(e => {
        console.log('GitHub: Failed for ' + project);
        console.log(e);
      });

      // We now have all of the issues form GitHub
  }
}

export { GitHubIssues }