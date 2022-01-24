#!/usr/local/bin/node
// https://www.tabnine.com/code/javascript/functions/node-fetch/fetch
// Key format:
// - Cannot parse privateKey: Unsupported key format
// - https://stackoverflow.com/questions/53400628/cannot-parse-privatekey-unsupported-key-format
// - https://serverfault.com/questions/939909/ssh-keygen-does-not-create-rsa-private-key/941893#941893?newreg=141e245aa38c4458a5551228ae101e66
// - https://stackoverflow.com/questions/17110783/how-to-do-request-http-digest-auth-with-node-js
//  ssh -p 29418 review.example.com gerrit stream-events
// var gaxios = require("gaxios"); // No good in here

var fs = require("fs");
var fetch = require("node-fetch");
var DigestFetch = require('digest-fetch');
var ssh2 = require("ssh2");
var mc = require("./mainconf.js");

// var upath = "a/accounts/$USER";
var upath2 = "a/changes/?q=owner:"; // Olli+Hollmen";

/*
gaxios.get(serv+upath).then((resp) => {
  var d = resp.data;
  console.log("Data:"+d);
}).catch((ex) => { console.log(ex); });
*/
let cfg = {};
var client;
var streamcmd;
// var conn; // SSH
function init(_cfg) {
  if (!cfg) { return; }
  cfg = _cfg;
  if (cfg.gerrit) { cfg = cfg.gerrit; }
  console.log("G-CONF: ", cfg);
  client = new DigestFetch(cfg.user, cfg.pass, { basic: false })
  // Can work with password ?
  var pkey   = fs.readFileSync(cfg.pkey, 'utf8'); // process.env['HOME']+'/.ssh/id_rsa'
  var sshconf = {host: cfg.host, port: cfg.port, username: cfg.user, privateKey: pkey};
  // streamcmd = "ssh -p 29418 " + cfg.host +
  streamcmd = "gerrit stream-events";
  // https://www.npmjs.com/package/ssh2
  return;
  var conn = ssh2.Client();
  conn.on('ready', () => {
    conn.exec(streamcmd, (err, stream) => {
      if (err) { throw err; }
      console.log("Ran "+streamcmd+" successfully ... streaming ...");
      stream.on('close', (code, signal) => {
        console.log("Stream close");
        
      }).on('data', (data) => {
        console.log('STDOUT: ' + data);
      }).stderr.on('data', (data) => {
        console.log('STDERR: ' + data);
      });
    });  
  }).connect(sshconf);
}
// const response = await
/*
var global = require(process.env["HOME"]+"/.linetboot/global.conf.json");
// global = mc.mainconf_load(globalconf);
mc.env_merge(global);
mc.mainconf_process(global);
init(global); // require(process.env["HOME"]+"/.linetboot/global.conf.json"));
*/

// 'https://github.com/'
function gerrapi(req, res) {

  var owner = cfg.user; // Get from req... (session)
  client.fetch("https://"+cfg.host+"/"+upath2+owner).then((resp) => {
    // console.log("Got to resp: ", resp);
    // resp.json();
    console.log("=========================================");
    //var txt = await resp.text();
    //console.log(txt);
    //console.log(resp.text());
    return resp.text();
  }).then((data) => {
    data = data.replace(/\)\]\}'/, '');
    data = JSON.parse(data);
    res.json({status: "ok", data: data});
    console.log(data);
  });

} // gerrapi

//const body = await response.text();
// console.log(body);

module.exports = {
  init: init,
  gerrapi: gerrapi,
};
