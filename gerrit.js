#!/usr/bin/env node
// https://www.tabnine.com/code/javascript/functions/node-fetch/fetch
// Key format:
// - Cannot parse privateKey: Unsupported key format
// - https://stackoverflow.com/questions/53400628/cannot-parse-privatekey-unsupported-key-format
// - https://serverfault.com/questions/939909/ssh-keygen-does-not-create-rsa-private-key/941893#941893?newreg=141e245aa38c4458a5551228ae101e66
// - https://stackoverflow.com/questions/17110783/how-to-do-request-http-digest-auth-with-node-js
//  ssh -p 29418 review.example.com gerrit stream-events
// var gaxios = require("gaxios"); // No good in here

var fs = require("fs");
// Legacy dependency (package.json): "digest-fetch": "1.2.1",
// var fetch = require("node-fetch"); // Use later node.js fetch (build in) API directly
var DigestFetch = require("digest-fetch");
var ssh2 = require("ssh2");
var cfl  = require("./confluence.js");

// var upath = "a/accounts/$USER";
var upath2 = "a/changes/?"; // q=owner:... Olli+Hollmen";

let cfg = {};
var client;
var streamcmd = "gerrit stream-events";
var sshconf;
var debug = 0;

// var conn; // SSH
function init(_cfg) {
  if (!_cfg) { return; }
  cfg = _cfg;
  if (cfg.gerrit) { cfg = cfg.gerrit; }
  debug && console.log("G-CONF: ", cfg);
  client = new DigestFetch(cfg.user, cfg.pass, { basic: false });
  // Can work with password ?
  var pkey;
  if (cfg.pkey) { pkey= fs.readFileSync(cfg.pkey, 'utf8'); }
  sshconf = { host: cfg.host, port: cfg.sshport, username: cfg.user, privateKey: pkey };
  // streamcmdbase = "ssh -p 29418 " + cfg.host +
  // streamcmd = "gerrit stream-events";
  return;
}

/* Receive events
* Event has
* - type - event type (ref-updated, comment-added, change-abandoned, change-merged)
* - submitter, patchSet, newRev, uploader, author (2 can be same), change - person (in change-merged)
* - uploader (in comment-added)
* - author (in comment-added)
* - abandoner, reason, patchSet (in change-abandoned)
* - refUpdate - with oldRev, newRev, refName, project (in ref-updated) ... this does not have number at all
* - approvals ([])
* - eventCreatedOn (e.g. 1642998276 always)
* - comment (in type comment-added)

* change has: project,branch,id (chidhash), number, subject,
* Info on ssh2: https://www.npmjs.com/package/ssh2
*/

function changes_recv() {
  debug && console.log(sshconf);
  var conn = ssh2.Client();
  conn.on('ready', () => {
    conn.exec(streamcmd, (err, stream) => {
      if (err) { throw err; }
      console.log("Ran "+streamcmd+" successfully ... streaming ...");
      stream.on('close', (code, signal) => {
        console.log("Stream close");
        
      }).on('data', (data) => {
        // console.log('STDOUT: ' + data);
        var evinfo;
	      try { evinfo = JSON.parse(data); }
	      catch (ex) { console.log("Error parsing evinfo: ", ex); }
	      console.log("EVINFO:"+JSON.stringify(evinfo, null, 2));
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });  
  }).connect(sshconf);
}

function gerrapi(req, res) {

  var owner = cfg.user; // Get from req... (session)
  let urlpath = upath2; // upath2+owner; // `${upath2}${owner}`
  if (req.url.match(/changes_my/) && owner)  { urlpath += `q=owner:${owner}`; }
  else if (req.url.match(/gerr\/repos/)) { urlpath = `a/projects/?d`; proj = 1; }

  let proj = 0;
  console.log(`Calling gerrit: ${urlpath}`);
  let rpara = { headers: { }};
  
  cfl.add_basic_creds(cfg, rpara);
  // "https://"+cfg.host+"/"+upath2+owner
  client.fetch(`https://${cfg.host}/${urlpath}`, rpara).then((resp) => {
    // console.log("Got to resp: ", resp);
    // resp.json();
    console.log("=========================================");
    //var txt = await resp.text();
    //console.log(txt);
    //console.log(resp.text());
    return resp.text();
  }).then((data) => {
    data = gerrit_json(data);
    //if (!data) {}
    if (proj) {
      const rre = new RegExp(cfg.repopatt, "");
      let rns = Object.keys(data);
      if (rre) {
        rns = rns.filter( (k) => {
          return k.match(rre) ? 1 : 0;
        });
      }
      data = rns.map( (k) => { return data[k]; });
      //data = okrepos;
    }
    if (res) { res.json({status: "ok", data: data}); }
    console.log(data, null, 2);
  });
  
} // gerrapi

function gerrit_json(data) {
    if (!data) { return null; }
    data = data.replace(/\)\]\}'/, '');
    // 
    data = JSON.parse(data);
    return data;
}
//const body = await response.text();
// console.log(body);

module.exports = {
  init: init,
  gerrapi: gerrapi,
  gerrit_json: gerrit_json,
};
let ops = [
  {id: "chstream", title: "Stream Gerrit Changes (by SSH)", cb: null},
  {id: "changes", title: "Gerrit Changes", cb: null},
  {id: "repos",   title: "Gerrit Repos/Projects", cb: null},
];
if (process.argv[1].match("gerrit.js")) {
  var mc = require("./mainconf.js");
  var mcfg = require(`${process.env["HOME"]}/.linetboot/global.conf.json`);
  // mcfg = mc.mainconf_load(globalconf);
  mc.env_merge(mcfg);
  mc.mainconf_process(mcfg);
  init(mcfg); // require(process.env["HOME"]+"/.linetboot/global.conf.json"));
  // gerrapi();
  changes_recv();
}
