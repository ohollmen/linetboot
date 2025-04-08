/** @File
* gittie.js - Misc universal Git operations
* ## GitHub API
* - https://docs.github.com/en/rest/teams/members?apiVersion=2022-11-28
* ## Refs to api entrypoints
* /repos/OWNER/REPO - Get repo details
* /repos/{owner}/{repo}/pulls - Pull requests
* /repos/OWNER/REPO/branches - Branches
* /repos/OWNER/REPO/issues - Issues
* /repos/OWNER/REPO/contributors - Contributors
* ## Content / updates
* /repos/OWNER/REPO/readme
* /repos/{owner}/{repo}/contents/{path}
* /repos/OWNER/REPO/tarball/REF - Tarball
* ## User bases
* /api/v3/users/${username}/events - Events (Create, Push)
*/
let fs       = require('fs');
var Mustache = require("mustache");
let axios    = require("axios");
let async    = require("async");
//const { cpuUsage } = require('process');
var Getopt   = require("node-getopt");
//const { getAllExtensions } = require('showdown');

let cfg = {};
let apiprefix = `/api/v3`; // Even this url returns a JSON w. large number of sub-urls !
function init(_mcfg) {
  if (!_mcfg) { throw "No config passed !"; }
  if (_mcfg.github) { cfg = _mcfg.github; }
  else { cfg = _mcfg; }
  // Check mems ?
  if (!cfg.ghapiver) { cfg.ghapiver = "2022-11-28"; }
}

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
// List / Add members to a team
// orgnum (e.g. 584819)
// List teams GET: https://${p.githost}/api/v3/orgs/${p.orgname}/teams
// List mems: GET 'https://${p.githost}/api/v3/organizations/${p.orgnum}/team/${p.teamid}/members?per_page=100' (Def. 30, Over 100 may be too much to ask. Also: page=N)
//  - Should also work: https://${p.githost}/orgs/ORGNAME/teams/TEAM_SLUG/members
// Add (Legacy): GET https://${p.githost}/api/v3/teams/${p.teamid}/members/${p.username}  // Api guide: TEAM_ID
// Add (new) PUT: https://${p.githost}/orgs/${p.orgname}/teams/TEAM_SLUG/memberships/${p.username}  -d '{"role":"maintainer"}' // TEAM_SLUG
//  - Note: teamslug ("slug") is usually same as teamname ("name"), except slug is always forced lowercase: slug = t.name.toLowerCase()
function gh_team_members(opts) {
  let apiurl = `https://${cfg.url}${apiprefix}`; let apiurl1 = apiurl;
  apiurl1 += `/orgs/${opts.orgname}/teams`;
  let apiurl2 = `/orgs/${opts.orgname}/teams/`;
  apiurl1 += `?per_page=100`;
  let rpara = { headers: { "Authorization": `Bearer ${cfg.token}`, "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":`${cfg.ghapiver}` } };
  console.log(`call api ${apiurl} w. `, rpara);
  // Use slug in the result
  axios.get(apiurl1, rpara).then( (resp) => {
    let d = resp.data;
    console.log(JSON.stringify(d, null, 2));
    //let t = d.find( (t) => { return t.slug == opts.teamname; }); // 
    let teams = d.filter( (t) => { return t.slug.match(opts.teamname); });
    console.log("RES:"+JSON.stringify(teams, null, 2));
    if ((teams.length > 1) || (teams.length < 1)) { console.log(`Not a unique group (to extract mems from) - stopping here`); return; }
    let memurl = teams[0].members_url;
    memurl = memurl.replace(/\{[^}]+\}/, ""); // rm param'z portion (of advised URL)
    if (!memurl || !opts.destteamname) { console.log(`dest team name (or memurl) Missing (for ${memurl}). Stopping here`); return; }
    if (!opts.destteamname.match(/^\d+$/)) { console.log(`Destination team must be given as teamid (number).`); return; }
    axios.get(memurl+`?per_page=100`, rpara).then( (resp) => {
      let d = resp.data;
      //console.log(d);
      if (!Array.isArray(d)) { console.log(`Not an array of members`); return; }
      let mems = d.map( (mn) => { return mn.login;  }); // return {login: mn.login};
      console.log(`${mems.length} members:`, mems);
      if (opts.dryrun) { console.error(`dryrun-mode: Should add ${mems.length} mems to ${opts.destteamname}`); return; }
      async.map(mems, gh_addmem, function (err, ress) {
        if (err) { console.log(`Error running (some of ${mems.length}) member additions: ${err}`); return; }
        console.log(`${mems.length} Members added to destination group ${opts.destteamname}`);
      });
      
    }).catch( (ex) => { console.error(`Error fetching members for group ${teams[0].slug}: ${ex}`); })
  }).catch( (ex) => { console.error(`Error: ... fetching teams for org ${opts.orgname}: ${ex}`); });
  // Add a member to a GH Group (async.js async.map-callback)
  function gh_addmem(uname, cb) {
    let url = `${apiurl}/teams/${opts.destteamname}/members/${uname}`;
    console.log(`CALL(PUT): ${url}`); //return cb(null, uname); // DEBUG
    axios.put(url, {"role":"member"}, rpara).then( (resp) => { // RESP w. 204 (Success)
      console.log(`Mem-add-status(${uname}): ${resp.status}`);
      if (resp.data) { console.log(`DATA: ${JSON.stringify(resp.data, null, 0)}`);}
      return cb(null, uname);
    }) // 
    .catch( (ex) => { console.error(`Error adding member (${uname}): ${ex}`, ex.response); return cb(ex, null); });
  }
}

// Create new GitHub repository.
// Must pass githost, gitorg, gitrepo (optionally ghapiver)
  function gh_mkrepo(p, gc, cb) {
    if (!p.githost || !p.gitorg || !p.reponame) { let m = `Some of parameters (githost, gitorg, gitrepo) missing for GH repo creation !`; console.log(m); return cb(m, null); }
    // GH E API URL. See public github  OLD: /api/v3
    let apiurl = `https://${p.githost}${apiprefx}/orgs/${p.gitorg}/repos`; // post See also auto_init
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
  init: init,
  gcred_load: gcred_load,
  gh_mkrepo: gh_mkrepo,
  rem_add_local: rem_add_local,
  //repo_create: repo_create,
  
};
let acts = [
  {id: "team", title: "List teams", cb: gh_team_members, }
];
var clopts = [
  // ARG+ for multiple
  ["o", "orgname=ARG", "GH Org Name (not id number)"],
  ["t", "teamname=ARG", "Team Name"],
  ["", "destteamname=ARG", "Destination team for member push"],
  ["", "dryrun", "Dry-Run mode (do not actually modify)"],
];
function usage(msg) {
  if (msg) { console.error(`${msg}`); }
  console.log(`Available Subcommands\n`+ acts.map( (a) => {return `- ${a.id} - ${a.title}`; } ).join("\n") );
  process.exit(1);
}
if (process.argv[1].match("gittie.js")) {
  let cfgfn = `${process.env.HOME}/.linetboot/global.conf.json`;
  let mcfg = require(cfgfn);
  if (!mcfg) { usage(`No config loaded`); }
  init(mcfg);
  console.error(`Loaded config ${cfgfn}`,cfg);
  // CLI Processing
  var argv2 = process.argv.slice(2);
  var op = argv2.shift();
  if (!op) { usage("No subcommand"); }
  var opnode = acts.find( (an) => { return an.id == op;  });
  if (!opnode) { usage(`Subcommand  ${op} not supported.`); }
  
  //var mc    = require("./mainconf.js");
  var getopt = new Getopt(clopts);
  var opt = getopt.parse(argv2);
  let opts = opt.options;
  console.log(opts);
  var rc = opnode.cb(opts) || 0;
}
