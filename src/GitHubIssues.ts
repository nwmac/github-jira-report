const dayjs = require('dayjs');

const { Octokit } = require('@octokit/rest');
const { graphql } = require("@octokit/graphql");

const GITHUB_ISSUES_REGEX = /https?:\/\/github.com\/([\d\w-_]+)\/([\d\w-_\.]+)\/issues\/(\d+)/;
class GitHubIssues {
  config: any;
  octokit: any;
  graphql: any;
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

    if (!this.config.github.token) {
      console.log('No GitHub token configured - you need to set one in the `config.json` file');
      process.exit(-1);
    }

    this.graphql = graphql.defaults({
      headers: {
        authorization: `token ${ config.github.token }`
      }
    });
  }

  getGitHubProjects(issues: any[], field: string) {
    const map = {};

    issues.forEach((i) => {
      const gh = i.fields[field];

      if (gh) {
        const matches = gh.match(GITHUB_ISSUES_REGEX);

        if (matches && matches.length === 4) {
          const owner = matches[1];
          const repo = matches[2];
          const slug = `${owner}/${repo}`;

          if (!map[slug]) {
            map[slug] = [];
          }

          map[slug].push(matches[3]);
        }
      }
    });

    return map;
  }  

  async getSpecificIssues(issues: string[], field: string) {
    // Group the issues into owner/repo and make a graphql call for each

    // Testing

    const ghIssues = {};

    const fetches = this.getGitHubProjects(issues, field);
    // console.log(fetches);

    const keys = Object.keys(fetches);

    for (let i=0;i< keys.length; i++) {
      const slug = keys[i];
    
      console.log(`Fetching GitHub issues in repository: ${slug}`);

      const repo = slug.split('/');
      let query = `{repository(owner:"${repo[0]}", name: "${repo[1]}") {\n`;

      fetches[slug].forEach((number: string) => {
        query += `issue_${number}: issue(number: ${ number }) { number,url,title,closed,milestone {title},labels(first:100) { nodes{name}} }\n`;
      });

      query += '}}';

      // console.log(query);

      const response = await this.graphql(query).catch((e) => {
        if (e && e.errors) {
          console.log('  Errors:');
          e.errors.forEach(err => {
            console.log(`      -> ${err.message}`);
          });
        }
        return e.data;
      });

      let repos = {};

      if (response && response.repository) {
        repos = response.repository;
      }

      Object.keys(repos).forEach((key: string) => {
        const i = repos[key];

        if (i) {
          ghIssues[i.url] = i;

          if (i.milestone && i.milestone.title) {
            i.milestone = i.milestone.title;
          }

          if (i.labels && i.labels.nodes) {
            const labels = i.labels.nodes.map(o => o.name);

            i.labels = labels;
          }
        }
      });

    };

    return ghIssues;
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