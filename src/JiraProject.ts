import * as JiraApi from 'jira-client';
import * as _ from 'lodash';

const JIRA_PAGE_SIZE = 100;

class JiraProject {
  config: any;
  jira: any;
  project: any;
  fields: any;
  priorities: any;
  users: any;
  sprints: any;
  activeSprint: any;
  public sprintsMap: any;
  public sprintIssues: any;

  // Newly created issues
  public issueCache = [];

  // Updated issues
  public updatedIssuesCache = [];

  // Version cache
  public versionCache = [];

  public gitHubField = '';

  public jiraURL = '';

  constructor(config: any, public all = false) {
    this.config = config;

    if (this.config.jira && !this.config.jira.protocol) {
      this.config.jira.protocol = 'https';
      this.config.jira.strictSSL = true;
    }
    
    this.jira = new JiraApi(this.config.jira);

    this.jiraURL = `${config.jira.protocol}://${config.jira.host}`;
  }

  mapPriority(priority: string) {
    if (priority === undefined || !this.config.jira.priorities) {
      return  '';
    }

    const found =  this.config.jira.priorities.findIndex(p => p.toLowerCase() === priority.toLowerCase());

    if (found !== -1) {
      return found + 1;
    }

    return '';
  }

  // project = TEST and resolution !=  Unresolved and "Trello Card ID" is not null

  load(projectKey: string) {
    console.log('Loading JIRA project: ' + projectKey);

    var all = [];
    all.push(this.jira.getProject(projectKey).then((p) => {
      this.project = p;
      this.versionCache = this.project.versions;
    }));

    all.push(this.jira.listFields().then((fields) => {
      this.fields = fields;

      const found = this.fields.find(f => f.name.indexOf('GitHub Issue') === 0);

      if (found) {
        this.gitHubField = found.id;
      }
    }));

    if (this.config.jira.userGroup) {
      all.push(this.jira.getUsersInGroup(this.config.jira.userGroup).then((users) => {
        this.users = {};
        if (users && users.users) {
          this.users = _.keyBy(users.users.items, 'key');
        }
      }));
    }

    all.push(this.updatedCacheVersions(projectKey));

    all.push(this.jira.listPriorities().then(priorities => {
      this.priorities = priorities;
    }));

    if (this.config.jira.agileBoard) {
      all.push(this.jira.listSprints(this.config.jira.agileBoard, true, true).then((agile) => {
        this.sprints = _.sortBy(agile.sprints, 'sequence');
        this.sprintsMap = _.keyBy(this.sprints, 'name');
      }));

      all.push(this.jira.getLastSprintForRapidView(this.config.jira.agileBoard).then((lastSprint) => {
        this.activeSprint = lastSprint;
        if (lastSprint) {
          var jql = 'project = ' + this.config.jira.projectKey + ' and sprint = "' + lastSprint.name + '"';
          return this.jira.searchJira(jql).then((results) => {
            this.sprintIssues = results.issues || [];
          });
        }
      }));
    }

    return Promise.all(all).then(() => {
      if(!this.activeSprint && this.sprints && this.sprints.length > 0) {
        this.activeSprint = this.sprints[0];
      }
    });
  }

  updatedCacheVersions(projectKey?: string) {
    const key = projectKey ? projectKey : this.project.key
    return this.jira.getVersions(key).then(v => {
      this.versionCache = v;
    });
  }

  moveIssuesToSprint(issueId, sprintId) {
    return this.jira.moveIssuesToSprint(sprintId, {
      issues: [issueId]
    });
  }

  listTransitions(issueId) {
    return this.jira.listTransitions(issueId).then((t) => {
      if (t && t.transitions) {
        return _.keyBy(t.transitions, 'name');
      } else {
        return {};
      }
    });
  }

  transitionIssue(issueId: string, issueTransition: any) {
    return this.jira.transitionIssue(issueId, {
      transition: {
        id: issueTransition.id
      }
    });
  }

  addIssueToSprint(issueId, sprintId) {
    return this.jira.addIssueToSprint(issueId, sprintId);
  }

  getIssue(issueKey: string) {
    return this.jira.findIssue(issueKey);
  }

  findIssueForGitHubIssue(url: string) {
    var jql = 'project = ' + this.config.jira.projectKey + ' and "GitHub Issue" = "' + url + '"';
    return this.jira.searchJira(jql).then((results) => {
      if (results.total > 0) {
        return results.issues[0];
      } else {
        return undefined;
      }
    });
  }

  cacheNewGitHubIssues(lastSyncDate) {
    return this.getGitHubIssues(false, lastSyncDate, null).then(() => console.log('JIRA: Fetched ' + this.issueCache.length + ' new issues'));
  }

  cacheUpdatedGitHubIssues(lastSyncDate, startDate) {
    return this.getGitHubIssues(true, lastSyncDate, startDate).then(() => console.log('JIRA: Fetched ' + this.updatedIssuesCache.length + ' updated issues'));
  }

  //"startAt":0,"maxResults":1000

  getGitHubIssues(updated: boolean, lastSyncDate, startDate) {
    return this.getGitHubIssuesPage(0, lastSyncDate, startDate, updated).then(results => {
      const total = results.total;

      // Fetch all of the pages
      var pages = Math.ceil(total / JIRA_PAGE_SIZE);
      // Already got first page
      pages--;
      if (pages > 0) {
        const fetches = [];
        for(var i=1;i<=pages; i++) {
          // console.log('Fetching page: ' + i);
          fetches.push(this.getGitHubIssuesPage(i, lastSyncDate, startDate, updated));
        }
        return Promise.all(fetches);
      }
    });
  }

  getGitHubIssuesPage(page: number, lastSyncDate, startDate, updated) {
    var jql = 'project = ' + this.config.jira.projectKey;
    const dateQuery = updated ? 'updatedDate' : 'createdDate';

    jql += ' AND resolution = Unresolved';

    if (!this.all) {
      jql += ' and "GitHub Issue" is not EMPTY';
    }

    if (this.config.jira.components) {
      jql += ` AND component
       IN (${ this.config.jira.components })`;
    }
    if (!!lastSyncDate) {
      let iso = lastSyncDate.toISOString().split('.')[0];
      iso = iso.substr(0, iso.length - 3).replace('T', ' ');
      jql += ' and ' + dateQuery + ' >= "' + iso + '"';
    }
    if (!!startDate) {
      let iso = startDate.toISOString().split('.')[0];
      iso = iso.substr(0, iso.length - 3).replace('T', ' ');
      jql += ' and ' + dateQuery + ' <= "' + iso + '"';
    }
    // Order results
    jql += ' ORDER BY ' + dateQuery + ' ASC';

    console.log('Fetching JIRA issues - page: ' + page);
//    console.log(jql);
    return this.jira.searchJira(jql, { startAt: page * JIRA_PAGE_SIZE, maxResults: JIRA_PAGE_SIZE }).then(results => {
      if (!updated) {
        this.issueCache = this.issueCache.concat(results.issues || []);
      } else {
        this.updatedIssuesCache = this.updatedIssuesCache.concat(results.issues || []);
      }
      return results;
    })
  }

  updateIssue(issueKey: string, update: any) {
    return this.jira.updateIssue(issueKey, update);
  }

  getSprintNameForIssue(issue: any) {
    var sprintField = this.getCustomField('Sprint');
    var name;

    var done = issue.fields.status.name === 'Done' || issue.fields.status.name === 'Won\'t Do';
    if (sprintField) {
      var sprintData = issue.fields[sprintField.id];
      sprintData = sprintData || [];
      for(var i=0; i<sprintData.length; i++) {
        var s = sprintData[i].toString();
        var p = s.split(',');
        var m : any = {};
        for(let kv of p) {
          var kvp = kv.split('=');
          if(kvp.length === 2) {
            m[kvp[0]] = kvp[1];
          }
        }

        if (m.name && (!done && m.state === 'ACTIVE' || done && m.state === 'CLOSED')) {
          name = m.name;
        }
      }
    }
    return name;
  }

  getIssueField(issue: any, fieldName: string) {
    var field = this.getCustomField(fieldName);
    if (field && field.id) {
      return issue.fields[field.id];
    } else {
      return issue.fields[fieldName];
    }
  }

  getCustomField(name: string) {
    return _.find(this.fields, {name: name});
  }

  createIssue(issue: any) {
    //console.log('CREATING ISSUE');
    //console.log(JSON.stringify(issue, null, 2));
    return this.jira.addNewIssue(issue);
  }
}

export { JiraProject }