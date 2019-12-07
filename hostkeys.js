var fs = require("fs");
/** List cached / backup stored hostkeys from local system.
* @
*/
function hostkeys_list(hostcache, cfg) {
  cfg = cfg || {};
  // E.g. 
  var keypath_def = process.env["HOME"] + "/.linetboot/sshkeys";
  var keypath = process.env["LINETBOOT_SSHKEY_PATH"] || keypath_def;
  var debug = process.env["LINETBOOT_DEBUG"] || 0;
  //if () {}
  if (!fs.existsSync(keypath)) { console.log("Keypath " + keypath + " not there.");return []; }
  var opts = {}; // withFileTypes: true
  var files = fs.readdirSync(keypath, opts);
  // Directories only
  // files = files.filter(function (de) { return de.isDirectory(); }); // Too NEW ?
  var hostdirs = files.filter(function (it) { // map() ?
    
    var stats = fs.statSync(keypath + "/" + it);
    var isdir = stats.isDirectory();
    return (isdir && hostcache[it]) ? 1 : 0;
  });
  //DEBUG: hostdirs = ["/etc/ssh/"]; // DEBUG
  console.log("Host Dirs: ", hostdirs);
  // ecdsa|ed25519|rsa
  var keynamere = /^ssh_host_(\w+?)_key(.pub|)/; // 
  var keylist = [];
  hostdirs.forEach(function (it) {
    var hk = {hname: it};
    var files = fs.readdirSync(keypath + "/" + it, opts);
    console.log("Initial Files: ", files);
    files = files.filter(function (f) {
      var m = f.match(keynamere);
      if (!m) { return false; } // Not a (matching) key file
      debug && console.log("Match:", m, "On: "+f);
      if (typeof m[2] == 'undefined') { return false; } // Empty OK
      var suff = {"": "_priv", ".pub": "_pub"};
      var kt = m[1] + suff[m[2]]; // Keytype + .pub / .priv
      debug && console.log("key:" + kt);
      hk[kt] = 1;
    });
    // Prepare to add some explict 0's (?)
    keylist.push(hk);
  });
  return keylist;
}
module.exports = {
  hostkeys_list: hostkeys_list
};
