/** @file
* # Deploy git (SVN?) projects / applications to arbitrary servers.
* For each "deployment" allow defining:
* - "name" - Name for Project Deployment
* - "srcrepo" - Source repository (as in "source code" or "source of deployment")
* - "deploydest" - Array of desintaion environments with Objects containing:
*   - "userhost" - SSH (and git) compatible user@host string
*   - "path" - Directory path on host where SW is deployed (keep this to
*     the directory that has the .git subdirectory in it, NOT the dir where you would typically run git clone)
*/

var inited = 0;
var depcfg = null;
var repocfg = null;
var fs   = require('fs');
var path = require('path');
var cproc = require('child_process');
var url = require("url");
var cfg;

function init(mcfg) {
  if (inited) { return; }
  if (!mcfg) { return; }
  console.log("Initing deployer");
  cfg = mcfg.deployer || mcfg;
  if (!cfg) { return; }
  if (!cfg.deployfn) { console.error("No deployer filename given"); return; }
  if (!fs.existsSync(cfg.deployfn)) { console.error("Deployer config ("+cfg.deployfn+") does not exist"); return; }
  depcfg = require(cfg.deployfn);
  if (!depcfg) { console.error("Failed to load checked-to-exist (JSON): "+cfg.deployfn+""); return; }
  console.log("depcfg successfully loaded: "+depcfg);
  // Load gitreposfn
  if (!cfg.gitreposfn) { console.error("No gitrepos filename given"); return; }
  if (!fs.existsSync(cfg.gitreposfn)) { console.error("Git Repos config ("+cfg.gitreposfn+") does not exist"); return; }
  repocfg = require(cfg.gitreposfn);
  if (!repocfg) { console.error("Failed to load checked-to-exist (JSON repocfg): "+cfg.gitreposfn+""); return; }
  console.log("repocfg successfully loaded: ", repocfg);
  //console.log(JSON.stringify(repocfg, null, 2)); // OK
  inited++;
}

/** Make a initial or update deployment from a Git repo to a destination environment.
* Base deployment on
* - "projlbl" - Project label given in (project) config
* - "dlbl" - Deployment label given for deployment (*under* config)
* - TODO: "vertag" as optional version tag to select version to deploy
* ## Example of running a deploy
* Test depoy with curl:
* ```
* GET: curl 'http://localhost:3000/deploy/?projlbl=corona_stats&dlbl=docean'
* POST: curl -X POST -H 'Content-Type: application/json' http://localhost:3000/deploy/ -d '{"projlbl":"corona_stats", "dlbl":"docean"}'
* ```
*/
function deploy(req, res) {
  var jr = { status: "err", "msg": "Failed to update project. "};
  // var env = {};
  //var p = req.query; // GET
  var p; //  = req.body; // POST
  // console.log("METHOD:"+req.method);
  console.log("Body: ", req.body);
  console.log("Query: ", req.query);
  try { p = deployparams(req); }
  catch (ex) { jr.msg += "Failed to extract deployment parameters: " + ex; return res.json(jr); }
  console.log("Deploy params: ", p);
  console.log("Found/Resolved Project and deployment: "+p.projlbl+" => "+p.dlbl+"");
  ///////////// Pull / Update ////////////////
  var depl = p.depl;
  var depltype = "update";
  var cmd = "ssh " +depl.userhost+ " 'cd "+depl.path+" &&' git pull --rebase";
  var cmd_i = "ssh " +depl.userhost+ " 'cd "+p.superpath+" &&' git clone " + p.proj.srcrepo;
  if(p.initial){cmd = cmd_i; depltype = "initial";}
  console.log("Run ("+ depltype +") deployment command: "+cmd);
  cproc.exec(cmd, (err, stdout, stderr) => {
    if (err) { jr.msg += "Failed to execute deployment. "+ stderr; return res.json(jr); }
    console.log(stdout);
    // Clone informs in stderr
    var info = stdout;
    if(p.initial){info = stderr;}
    console.log("STDERR: ", stderr);
    res.json({status: "ok", data: info});
  });
  
}
/** Extract deployment parameters from web request (POST ? GET?).
* Supports both GET and POST methods with parameter names:
* - projlbl
* - dlbl
* These parameters must be found hierarchically in deployment config.
* @param req {object} - Node.js Express Request object
* @return Deployment node object
*/
function deployparams(req) {
  var p;
  if      (req.method == 'GET')  { p = req.query; }
  else if (req.method == 'POST') { p = req.body; }
  else { return null; }
  if (!p) { throw "No query params for deployment";  }
  ////// Resolve Project
  var plbl = p.projlbl;
  if (!plbl) { throw "No project label for deployment"; }
  var proj = depcfg.find((proj) => { return proj.projlbl == plbl; });
  if (!proj) { throw "No project by label "+plbl+" found";  }
  p.proj = proj;
  ////// Resolve deployemnt
  var dlbl = p.dlbl;
  if (!dlbl) { throw "No deployment label for deployment";  }
  var depl = proj.deploydest.find((depl) => { return depl.dlbl == dlbl; });
  if(!depl){throw "Deployment node not found";}
  if(!depl.path){throw "Deployment node path not found";}
  p.superpath = path.dirname(depl.path);
  
  p.depl = depl;
  return p;
}
/** Load config (for UI).
*/
function config(req, res) {
  var d = depcfg;
  if (req.url.match(/gitrepo/)) { d = JSON.parse(JSON.stringify(repocfg)); }
  res.json({status: "ok", data: d});
}

/**
* DO something like:
ssh ${USER}@remhost 'cd /the/repos && git init --bare --shared=group reponame.git && chown -R $USER:www-data reponame.git'
* ## Repo config
* - lbl /repolbl - Short id label for repo
* - name - Descriptive Name to show in GUI
* - url - SSH url to repo (NOT http(s))
*   - Could alternatively have: user, host, path
* - group - Group owner of repo on the bare repo side
* - user - User owner of repo (default to one found in URL)
* ## Requirements for the remote Git repo end
* - System must have `git` installed
* - The repo root must be an existing directory
* - The repo root muts be owned by the user logging in (in ssh URL)
* - The group to change ownership must be one of users own group (no need to be primary)
* - Default umask (or git) should create resonable user/group access to repo so that it is
*   usable after creation (drwxrwsr-x ?? umask 0022)
* ## Testing
* curl curl 'http://localhost:3000/createrepo?repolbl=foo&&reponame=sample'
* TODO: test all tainted vars (for shell sensitive chars)
*/
function createrepo (req, res) {
  var jr = { status: "err", "msg": "Failed to create project repo. "};
  //if (!cfg) { jr.msg += "No deployer main Config"; return res.json(jr); }
  //if (!cfg.gitroots) { jr.msg += "No gitroots main Config"; return res.json(jr); }
  //if (!Array.isArray(cfg.gitroots)) { jr.msg += "gitroots main Config not in array"; return res.json(jr); }
  //var gr = cfg.gitroots[0];
  console.log(depcfg); // OK
  console.log(repocfg);
  if (!repocfg) { jr.msg += "No repocfg Configuration"; return res.json(jr); }
  if (!Array.isArray(repocfg)) { jr.msg += "No repocfg as Array"; return res.json(jr); }
  
  console.log("createrepo called with: "+req.method);
  var p = req.method == 'GET' ? req.query : req.body;
  console.log("P: ", p);
  // 1) See that repo by lbl exists
  if (!p.repolbl) { jr.msg += "No repolbl passed"; return res.json(jr); }
  var repo = repocfg.find((it) => { return it.lbl == p.repolbl; });
  if (!repo) { jr.msg += "No repo config found by label "+ p.repolbl; return res.json(jr); }
  var gurlstr = repo.url;
  var gurl = url.parse(gurlstr); // new URL(gurlstr);
  if (!gurl) { jr.msg += "URL could not be parsed"; return res.json(jr); }
  console.log(gurl);
  // Validate Git URL (gurl)
  if (!gurl.auth) { jr.msg += "No user ('auth') in URL"; return res.json(jr); }
  if (gurl.auth.match(':')) { jr.msg += "User ('auth') in URL has creds embedded (should not have)"; return res.json(jr); }
  // var repocfg = {user: null, group: ""};
  var reponame = p.reponame; // Must have reponame from client !
  if (!reponame) { jr.msg += "No reponame"; return res.json(jr); }
  if (!reponame.match(/\.git/)) { reponame += ".git"; }
  if (gurl.path.match(/\s/) || gurl.path.match(/%20/)) { jr.msg += "Git path has spaces in it!"; return res.json(jr); }
  var cdcmd = "cd "+gurl.path;
  var gitcmd = "git init --bare --shared=group "+ reponame;
  // Note: repouser may *have to* be the gurl.auth, as user cannot chown files to
  // another user (or group where user does not belong)
  var repouser  =  gurl.auth; // repocfg.user || <= research
  var repogroup = repo.group || "users"; // e.g. www-data (for HTTP push)
  if (!repouser) { jr.msg += "No repo user to set owner (from user or repo url)"; return res.json(jr); }
  //var chown = "chown -R "+repouser+":"+repogroup + " "+reponame;
  var chown = "chgrp -R "+repogroup+ " "+reponame;
  var cmd = "ssh "+gurl.auth+"@"+gurl.host + " '"+cdcmd +" && "+gitcmd + " && "+chown+"'";
  var repofullname = gurlstr+reponame;
  /*
  cproc.exec(cmd, (err, stdout, stderr) => {
    if (err) { jr.msg += "Failed to execute mkrepo. "+ stderr; return res.json(jr); }
    console.log(stdout);
    // Clone informs in stderr
    var info = stdout;
    if (p.initial) {info = stderr;}
    console.log("STDERR: ", stderr);
    
    res.json({status: "ok", data: info});
  });
  */
  res.json({status: "ok", data: "Repo "+repofullname+" should be ready to use"});
  console.log("COMMAND:"+cmd);
}

module.exports = {
  init: init,
  // initdeploy: initdeploy,
  deploy: deploy,
  config: config,
  createrepo: createrepo
};
