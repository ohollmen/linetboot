/** @File
* gittie.js - Misc universal Git operations
*/
let fs = require('fs');
var Mustache   = require("mustache");

// Load credentials for a Git server host from .git-credentials file.
// @return credentials (object) w. username and password on success, null
// on failure to find host.
function gcred_load(fn, hn) {
    if (!hn) { console.log("No Git host passed\n"); return null; }
    fn = fn || `${process.env["HOME"]}/.git-credentials`;
    if (!fs.existsSync(fn)) { console.log(`No git creds file by name ${fn} found.`); return null; }
    var cont = fs.readFileSync(fn, 'utf8');
    let arr = cont.split("\n");
    console.log(arr); console.log(`Look for '${hn}'`);
    // 'github'
    let m = arr.find( function (l) { console.log(`L:${l}, Len: ${l.length}`); return l.includes(`${hn}`); }); //  l.indexOf(hn) > 1
    console.log(arr);
    if (!m  ) { console.log(`No host matches (for ${hn}) in '${fn}'`); return null; } //
    //if (arr.length != 1) { console.log(`not unique (${arr.length})`); return null; }
    let url = new URL(m); // [, base] <= burl
    return({password: url.password, username: url.username});
  }
// Create new GitHub repository.
// Must pass githost, gitorg, gitrepo (optionally ghapiver)
  function gh_mkrepo(p, gc, cb) {
    if (!p.githost || !p.gitorg || !p.reponame) { let m = `Some of parameters (githost, gitorg, gitrepo) missing for GH repo creation !`; console.log(m); return cb(m, null); }
    // GH E API URL. See public github
    let apiurl = `https://${p.githost}/api/v3/orgs/${p.gitorg}/repos`; // post See also auto_init
    let ghm = {"name": p.reponame,"description":`Git repo ${p.reponame}`,"homepage":"","private":true,"has_issues":false,"has_projects":false,"has_wiki":false}; // auto_init
    console.log(`Send (${apiurl}):`, ghm);
    // "Accept: application/vnd.github+json" // 'content-type': 'application/json',
    if (!p.ghapiver) { p.ghapiver = "2022-11-28"; }
    let hdrs =  { "Authorization": `Bearer ${gc.password}`, "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":`${p.ghapiver}`}; //"2022-11-28"
    // https://docs.github.com/en/rest/teams/teams?apiVersion=2022-11-28#add-or-update-team-project-permissions
    axios.post(apiurl, ghm, {headers: hdrs}).then( (resp) => {
      //if (resp.error) { }
      
      // Capture PROJECT_ID for next calls (E.g. id: 173608,)  // {project_id}
      let pid = resp.data.id;
      p.projid = pid;
      console.log(`GH Repo-create Success (Repo/Project ID: ${pid}). When ready to push do: git push -u origin main `); // , resp.data
      // let tau = `https://${cfg.gitremotehost}/api/v3/orgs/${p.gitorg}/teams/${cfg.team_slug}/projects/${pid}`; // PUT
      // i.e.
      return cb(null, p);
    }).catch( (ex) => {
      //console.log(`Failed GH (repo-c) request: ${ex} (Status: ${ex.response.status}, Data: ${ex.response.data}}`);
      console.log(ex.toJSON());
      return cb(`Error creating repo ${ex} (see dump above)`, null);
    });
  }
  function rem_add_local(p, cb) {
    let rtmpl = {"ssh": "git@{{ githost }}:{{ gitorg }}/{{ reponame }}.git", "http": "https://{{ githost }}/{{ gitorg }}/{{ reponame }}"};
    let conntype = p.conntype || 'ssh'; if (!rtmpl[conntype]) { conntype = 'ssh'; } // Prefer SSH
    let rstr = Mustache.render(rtmpl[conntype], p); // cfg.gitremote, p
    let racmd = `git remote add origin ${rstr}`;
    console.log(`Remote Add command:`, racmd); //process.exit(1);
    let cwd = p.cwd || process.cwd();
    cproc.exec(racmd, {cwd: `${cwd}`}, function (err, stdout, stderr) { // cfg.someroot
      if (err) { let m = "Failed to add(register) remote/origin locally."; console.error(m); return cb(m, null); }
      console.log(`Added remote (${rstr}) successfully!`);
      p.rstr = rstr;
      return cb(null, p);
    });
  }

// Create repo on GitHub/GitLab
// Pass: gitorg, reponame
function repo_create(host, p) {
  //if (p.desc) { ghm.description = p.desc; }
  // Similar for: has_issues, has_projects, has_wiki ?
}

module.exports = {
  gcred_load: gcred_load,
  gh_mkrepo: gh_mkrepo,
  rem_add_local: rem_add_local,
  repo_create: repo_create,
  
};
