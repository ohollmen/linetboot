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
var fs   = require('fs');
var path = require('path');
var cproc = require('child_process');

function init(mcfg) {
  if (inited) { return; }
  if (!mcfg) { return; }
  console.log("Initing deployer");
  var cfg = mcfg.deployer || mcfg;
  if (!cfg) { return; }
  if (!cfg.deployfn) { console.error("No deployer filename given"); return; }
   if (!fs.existsSync(cfg.deployfn)) { console.error("Deployer config ("+cfg.deployfn+") does not exist"); return; }
  depcfg = require(cfg.deployfn);
  if (!depcfg) { console.error("Failed to load checked-to-exist (JSON): "+cfg.deployfn+""); }
  console.log("depcfg successfully loaded: "+depcfg);
  // console.log(JSON.stringify(depcfg, null, 2));
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
  res.json({status: "ok", data: depcfg});
}

module.exports = {
  init: init,
  // initdeploy: initdeploy,
  deploy: deploy,
  config: config,
};
