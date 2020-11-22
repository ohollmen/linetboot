/** @file
# Linetboot post-install mediation.

Allow executing a JS callback or shell command when the OS-installed host comes up on the first boot.

*/
var node_ssh = require('node-ssh');
var cproc   = require('child_process');

//var ssh2  = require('ssh2');
//var sshcfg;
//var ssh;

var setupmod;
var inited = 0;

function init(_setupmod) {
  if (inited) { return; }
  inited = 1;
  setupmod = _setupmod;
  return module.exports;
}

function dclone(d) { return JSON.parse(JSON.stringify(d)); }
var netprobe = require("./netprobe.js");
/** Initialize hostup-poller (synchronously).
 * Hold all the state of polling here and clone/copy intial values from config (global.postinst).
 */
function hostup_init(global, ip) {
  // cb = cb || function () {};
  // TODO: get to know if *this* host (or OS profile) needs post-provisioning
  //
  //var hu = {};
  var picfg = dclone(global.postinst || {});
  picfg.username = global.postinst.user || process.env['USER'];
  picfg.sshcfg = { host: ip, username: picfg.username, privateKey: netprobe.privkey() }; // pkey
  //var conn = new ssh2.Client();
  picfg.ssh = new node_ssh();
  picfg.global = global;
  picfg.ip = ip;
  picfg.user_host = picfg.username+"@"+picfg.ip;
  console.log("End-of-install: Created SSH client to connect back to "+picfg.ip+" for post-install");
  console.log("Try run (effectively): ssh "+picfg.user_host+"");
  
  picfg.initwait = picfg.initwait || 60; // Initial delay before starting to poll (s.)
  picfg.pollint  = picfg.pollint  || 10; // Poll interval (s.)
  picfg.trycnt   = picfg.trycnt || 30; // Number of pollings (cnt)
 //var trycnt = picfg.trycnt;
 return picfg;
}
/** Do intial wait / delay before starting to poll (to save poll cycles and clutter of log)
* What we could do here is ping host at the end to ensure it is up.
*/
function hostup_init_wait(picfg, cb) {
  var dt = new Date();
  console.log(dt.toISOString()+" Starting initial idle-wait: "+picfg.initwait+" s.");
  setTimeout(() => { cb(null, picfg); }, picfg.initwait*1000);
}
/** Poll for the host to come up.
 * TODO: ret null vs ...
 */
function hostup_poll(picfg, cb) { // hostup_poll(some, cb)
  var trycnt = picfg.trycnt;
  var global = picfg.global;
  var ip = picfg.ip;
  // console.log("Got: ", picfg, ""+cb);
  var iid = setInterval(function () { // iid = Interval ID
    var dt = new Date();
    if (trycnt < 1) {
      console.log(dt.toISOString()+" Try count exhausted (tries-left "+trycnt+")");
      clearInterval(iid);
      return cb("Tries Exhausted and Host not reached in "+picfg.trycnt+" tries", null);
    }
    console.log(dt.toISOString()+" Try SSH: "+picfg.user_host+ "");
    picfg.ssh.connect(picfg.sshcfg).then(function () {
      console.log("Got SSH connection: "+picfg.user_host+" (tries-left: "+trycnt+")");
      // because of successful ssh connect, we can cancel polling.
      clearInterval(iid);
      console.log("SSH Success - Canceled polling (re-trying) on "+ picfg.user_host);
      // Continue with some ssh operation (e.g. ssh.execCommand(cmd, {cwd: ""})) ?
      // ... or just trigger ansible via ansiblerunner ?
      
      return cb(null, picfg);
    }).catch(function (ex) {
       console.log("No SSH Conn: "+ex+" (tries-left "+trycnt+") continue ..."); // . Continue polling at every "+pollint+" ms.
    });
    trycnt--;
  }, picfg.pollint*1000);
}
/** Launch post-install action after host was reached (by SSH) after first boot.

*/
function hostup_act(picfg) {
  
  if (!picfg) { console.log("Caller signaled failed polling."); return; }
  var global = picfg.global;
  var ip = picfg.ip;
  // setupmod.onhostup JS callback
  if (typeof setupmod.onhostup == 'function') {
    // Initially launch as "fire-n-forget". If we want to e.g. time this, this has to be more controlled.
    try {
      setupmod.onhostup(global, ip); // picfg.sshcfg
    } catch (ex) {
      console.error("Error running setupmod.onhostup(): "+ex);
    }
    // return cb(null, 55);
  }
  // Shell executable picfg.execact
  else if (picfg.execact) {
    // TODO: var f = picfg.f || {};
    // Setup a set of useful environment variables (POSTOP_*) for execact to inherit
    // var env = picfg.copyenv ? dclone(process.env) : {};
    var env_olay = {
      POSTOP_IP: picfg.ip,
      POSTOP_USER: picfg.user,
      //POSTOP_OS: f..., // OS- From facts
      LINETBOOT_URL: "http://"+picfg.global.httpserver,
      LINETBOOT_HOSTS_FILE: picfg.global.hostsfile,
      // 
      // 
    };
    cproc.exec(picfg.execact, {maxBuffer: 1024 * 500, env: env_olay}, function (err, stdout, stderr) {
      if (err) { console.log("Error executing 'execact' using: "+picfg.execact+": "+err+" (rc="+err.code+")"); return; }
      console.log("Executed '"+picfg.execact+"' with stdout:\n"+stdout);
    });
  }
  // OLD: console.log("Could not find onhostup-action from: ",setupmod,"!");
  else { console.log("Could not find onhostup-action from config !"); }
}
    
module.exports = {
  init: init,
  hostup_init: hostup_init,
  hostup_init_wait: hostup_init_wait,
  hostup_poll: hostup_poll,
  hostup_act: hostup_act
};
