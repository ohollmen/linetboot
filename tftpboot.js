/** @file
* TFTP, Boot and Bootmenu related functionality.
* Should collaborate with ipmi/rmgmt (Redfish)

* TODO: Move to here:
* bootlabels() -OK
* installrequest()
*   menu_macfilename(); OK
* tftp_listing()
* has_macfile_pattern()
*/
var fs = require("fs");
var Mustache = require("mustache");

function dclone(d) { return JSON.parse(JSON.stringify(d)); }

function init() {}
/**
 * @param f {string} - Mac address string or Facts object indicating unique host
 */
function has_macfile_pattern(bn, retmac) {
    var patt = /^01-([0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2})$/;
    var ok = bn.match(patt);
    if (ok && retmac) { return ok[1].replace(/-/g, ':').toLowerCase(); }
    return ok;
  }

/** Create a MCA-Address based file in global.tftp.root + "" + "01"+MACaddr (See: hostcommands.js)
 * @param f {string} - Mac address string or Facts object indicating unique host
 * @return MAC Address based filename ("01" prefixed, colons trurned into hyphens)
 */
function menu_macfilename(f) {
  if (!f) { console.log("menu_macfilename: No facts or macaddr !"); return ""; }
  var mac;
  if (typeof f == 'string') { mac = f; }
  else { mac = f.ansible_default_ipv4 ? f.ansible_default_ipv4.macaddress : ""; }
  if (!mac) { return ""; }
  mac = mac.replace(/:/g, "-");
  mac = mac.toLowerCase();
  if (!mac) { return ""; }
  var macfn = "01-" + mac;
  return macfn;
}
/** List PXELinux Config directory files.
 */
function pxelinuxcfg_list(path, extra) {
  var list = fs.readdirSync(path);
  var list2 = [];
  list.forEach(function (it) {
    console.log("ITEM:"+it);
    if (!has_macfile_pattern(it)) { return; } // Skip !
    // Extra info (as Object)
    if (extra) {
      var info = {fname: it};
      var fullpath = path + "/" + it;
      // NOTE: Must do lstatSync(), NOT plainly statSync()
      var stats = fs.lstatSync(fullpath); // [, options]
      // Stat for size, date, symlinkness
      info.size  = stats.size;
      info.mtime = stats.mtime;
      //info.ctime = stats.ctime;
      info.issym = stats.isSymbolicLink(); // Resolve to which file ?
      list2.push(info);
      return;
    }
    list2.push(it);
  });
  return list2;
}

/** Collect boot labels from boot menu file.
 * Create a (Array-of-Objects) list of os label ("id"), os description ("name") entries.
 * @param fn {sting} - Pxelinux boot menu filename with resolvable (e.g. relative) path.
 * @return list of OS descriptions.
 */
function bootlabels(fn) {
  // Consider what config section to put into (tftp.menutmpl)
  //var fn = global.tftp.menutmpl;
  
  //fn = "./tmpl/default.installer.menu.mustache";
  if (!fs.existsSync(fn)) { return null; }
  var menucont = fs.readFileSync(fn, 'utf8');
  var m = [];
  var i = 1;
  console.log("bootlabels: Starting matching");
  //console.log(menucont);
  // Returns only $0:s in every match ("label word").
  //var m = menucont.match(/^label\s+(\w+)/gm);
  var re = /^label\s+(\w+)\nmenu\s+label\s+([^\n]+)\n/gm;
  var match;
  while (match = re.exec(menucont)) {
    //m.push(match[1]);
    m.push({ id: match[1], name: match[2] });
    //console.log(match);
    //console.log("Match "+i); i++;
  }
  return m;
}
/** Menu Default Boot Item Label.
 * @param fn {string} - Menu Filename
 * @return Boot label string
 */
function menu_deflbl(fn) {
  if (!fs.existsSync(fn)) { return null; }
  var menucont = fs.readFileSync(fn, 'utf8');
  // "-" seems to be valid char in boot label
  var re = /^default\s+([\w\-]+)/gm;
  var match = re.exec(menucont);
  if (match) { return match[1]; }
  return "";
}

/** Convertboot label to bootitem (w. id and name)
* Can be used to would validate boot label against a real manu or provide info for bootitem.
* @param bootlbl {string} - Boot label
* @param tcfg {object} - TFTP Config (for the tcfg.menutmpl)
* @return Boot Item.
*/
function bootlbl2bootitem(bootlbl, tcfg) {
  tcfg = tcfg || {}; // module init stored ?
  if (!tcfg.menutmpl) { throw "No Boot Menu file found for label validation "; }
  var mfn = tcfg.menutmpl;
  // Validate boot label against 
  var boots = bootlabels(mfn);
  if (!boots) { throw "No bootlabel structure";  } // return null;
  var bootitem = boots.filter(function (it) { return it.id == bootlbl; })[0];
  if (!bootitem) { throw "No Boot Item found from menu by " + bootlbl; }
  return bootitem;
}

/** Generate and store boot menu file
* - Generate menu based on global info (cloned) and override default boot label
* - Store into file by pxelinux preferred MAC address based filename
* @param tcfg {object} - TFTP Config (section of main config) w. "menutmpl" and "root"
* @param global {object} - Global config used as params for templating (used members tftp.menutout tftp.menudef httpserver nfsserver)
* @param bootlbl {string} - Boot menu label to use as default booot item
* @param f {object} - Optional ansible facts for single host item OR leave out to generate "default" menu (defines underlying filename).
* @return Full filename for the stored menu.
*/
function bootmenu_save(tcfg, global, bootlbl, f) {
  ////  Generate
  var mfn = tcfg.menutmpl;
  var tmpl = fs.readFileSync(mfn, 'utf8');
  var g = dclone(global); // MUST Copy (to change below) !
  g.tftp.menudef = bootlbl;
  var cont = Mustache.render(tmpl, g);
  console.log("Created "+cont.length+" Bytes of menu content");
  ////////// Save
  var macfn = f ? menu_macfilename(f) : "default"; // No facts => "default"
  if (!macfn) { throw "No MAC Address (in facts) for "+q.hname;  }
  console.log("Resolved MAC-based menu filename to " + macfn);
  var root = tcfg.root;
  if (!fs.existsSync(root)) { throw "TFTP root does not exist";  }
  var pxecfg = root + "/pxelinux.cfg/";
  if (!fs.existsSync(pxecfg)) { throw "pxelinux.cfg under TFTP root does not exist";  }
  var fullmacfn = pxecfg + macfn;
  // If found, delete old, existing
  if (fs.existsSync(fullmacfn)) {
    try { fs.unlinkSync(fullmacfn); } catch(ex) { throw "Could not remove any previous macfile " + ex.toString(); }
  }
  try {
    fs.writeFileSync( fullmacfn, cont, {encoding: "utf8"} ); // {encoding: "utf8"}, "mode": 0o666
  } catch (ex) { throw "Could not write new macfile named menu " + ex; }
  return fullmacfn;
} // bootmenu_save

/** Remove old file and recreate symlink to "default".
* Validate filename as correcly formatted MAC based filename and
* check presence on filesystem.
*/
function bootmenu_link_default(tcfg, macfname) {
  if (!tcfg) { throw "No TFTP Config"; }
  if (!macfname) { throw "No MAC based menu filename"; }
  if (!has_macfile_pattern(macfname)) { throw "MAC Base Menu filename not in correct format "; }
  var fullfn = tcfg.root+ "/pxelinux.cfg/" + macfname;
  if (!fs.existsSync(fullfn)) { throw "Boot menu file not there"; }
  // Unlink and symlink
  try { fs.unlinkSync(fullfn); }
  catch(ex) { throw "Could not remove menu file symlink " + ex.toString(); }
  // Need try/catch
  try { fs.symlinkSync("default", fullfn); }
  catch(ex) { throw "Could not create new default menu file symlink " + ex.toString(); }
  
}

module.exports = {
  // init: init,
  has_macfile_pattern: has_macfile_pattern,
  menu_macfilename: menu_macfilename,
  pxelinuxcfg_list: pxelinuxcfg_list,
  bootlabels, bootlabels,
  menu_deflbl: menu_deflbl,
  bootlbl2bootitem: bootlbl2bootitem,
  bootmenu_save: bootmenu_save,
  bootmenu_link_default: bootmenu_link_default
};
