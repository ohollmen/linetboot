/** @file
 * # Host Command
 * 
 * Allow running generated commands related to hosts of host inventory:
 * - Remotely on remote host via SSH
 * - Locally passing hostname as parameter
 * 
 * Each command node 
 */
var Mustache = require("mustache");

  var genopts = [
    // 
    {"lbl": "barename", name: "Bare Host Names Listing",
      "longname": "Bare Host Names Listing (w. optional params by para=p1,p2,p3)",
      "cb": function (info, f, ps) {
        // var ps = req.query.para; // Comma sep.
        var cmd = info.hname;
        if (ps) { var pstr = pstr_gen(ps); cmd += pstr ? (" " + pstr) : ""; }
        return cmd;
      },
      "tmpl":"{{ hname }}"
    },
    {"lbl": "addrname", name: "IP Address, Hostname Pairs", "cb": function (info, f, ps) {
      //var ps = req.query.para; // Comma sep.
      var cmd = info.hname;
      if (!info.hname) { return ""; }
      var padsize = 16-info.ipaddr.length; // Max IP: 15, 
      return info.ipaddr + " ".repeat(padsize) + info.hname;
    }},
    {"lbl": "maclink", name: "MAC Address Symlinks", "cb": function (info, f) {
      var mac = f.ansible_default_ipv4 ? f.ansible_default_ipv4.macaddress : "";
      if (!mac) { return "# No MAC for "+info.hname; }
      mac = mac.replace(/:/g, "-");
      mac = mac.toLowerCase();
      return "ln -s default " + "01-" + mac; // Prefix: "01"
    }},
    {"lbl": "setup",   name: "Facts Gathering", "cb": function (info, f) {
      return  "ansible -i ~/.linetboot/hosts "+info.hname+" -b -m setup --tree "+info.paths.hostinfo+" --extra-vars \"ansible_sudo_pass=$ANSIBLE_SUDO_PASS\"";
    }},
    {"lbl": "pkgcoll", name: "Package List Extraction", "cb": function (info, f) {
      return  "ssh " + info.username+"@"+ info.hname + " " + info.pkglistcmd + " > " + info.paths.pkglist +"/"+ info.hname;
    }},
    {"lbl": "rmgmtcoll", name: "Remote mgmt. info Extraction", "cb": function (info, f) {
      return  "ansible-playbook -i ~/.linetboot/hosts  build-idrac.yaml --extra-vars \"ansible_sudo_pass=$ANSIBLE_SUDO_PASS host="+info.hname+"\"";
    }},
    // SSH Key archiving
    {"lbl": "sshkeyarch", name: "SSH Key archiving",
      // "ssh -t {{ info.hname }} 'sudo rsync /etc/ssh/ssh_host_* {{username}}@{{ currhname }}:"+ info.userhome +"/.linetboot/sshkeys/"+info.hname+"'"
      "cb": function (info, f) {
      return "ssh -t " + info.hname + " 'sudo rsync /etc/ssh/ssh_host_* "+ info.username +"@"+ process.env['HOSTNAME'] + ":"+ info.userhome +"/.linetboot/sshkeys/"+info.hname+"'";
    }},
    // 
  ];
var genopts_idx;

// TODO: user.username
function init() {
  genopts_idx = {};
  genopts.forEach(function (it) { genopts_idx[it.lbl] = it; }); // Once ONLY (at init) !
  module.exports.genopts_idx = genopts_idx;
}
var paths = {
    pkglist: "~/hostpkginfo",
    hostinfo: "~/hostinfo",
  };
  // See also (e.g.): ansible_pkg_mgr: "yum"
  var os_pkg_cmd = {
    "RedHat": "yum list -q installed", // rpm -qa, repoquery -a --installed, dnf list installed
    "Debian": "dpkg --get-selections", // apt list --installed (cluttered output), dpkg -l (long, does not start w. pkg)
    // Suse, Slackware,
    // "Arch???": "pacman -Q",
    //"SUSE???": "zypper se --installed-only",
  };
// Middle: || user.username
var username = process.env['USER']  || "root";

function pstr_gen(ps) {
    if (!ps) { return ""; }
    //console.log("Got to barename, have params");
    ps = ps.split(/,/);
    var pstr = ps.map(function (p) {return p+"=";}).join(" ");
    // console.log(pstr);
    return pstr;
}


function commands_gen(op, hostarr, ps) {
  if (!Array.isArray(hostarr)) { console.log("commands_gen: No host facts array"); return null; }
  // OLD: Generate commands to scalar string var cont by cont += ....
  // NEW: Generate an array of commands to be granularly executed by child_process / ssh, etc.
  var cmds = [];
  hostarr.forEach(function (f) {
    var plcmd = os_pkg_cmd[f.ansible_os_family];
    if (!plcmd) { cont += "# No package list command for os\n"; return; }
    // Parameters for host (for CB-based or template based command generation)
    // Actually this is a mix of module context and host context params
    var info = {
      hname: f.ansible_fqdn, ipaddr: f.ansible_default_ipv4.address, // Host (in iteration)
      currhname: process.env['HOSTNAME'], // Current Linetboot local host
      username: username, userhome: process.env["HOME"], // User
      pkglistcmd: plcmd, paths: paths
      
    };
    var cmdcont, cmd;
    if (op.tmpl) { cmd = Mustache.render(op.tmpl, info); }
    //if (f.ansible_os_family) {}
    else { cmd = op.cb(info, f, ps); }
    // OLD: cont += cmd + "\n"; // TODO: cmdarr.push(cmd), later join
    cmds.push(cmd);
  });
  return cmds;
}

module.exports = {
  init: init,
  genopts: genopts,
  // genopts_idx: genopts_idx
  commands_gen: commands_gen
};
