/** @file
* Find GCP roles (for "name") by display name ("title").
* The "full catalog" of roles is extractable by: `gcloud iam roles list` (populate gcproles.yaml w. this).
* 
* ## List or roles and list of perms
* - List of roles (default): ~/.linetboot/gcproles.yaml
* - Lists of perms of roles stored in (default): ~/.linetboot/gcproleperms/
*   - File names (e.g.): 'roles/compute.admin' (role) => compute.admin.json
* ## Refs
* - https://cloud.google.com/iam/docs/understanding-roles
*/
let fs = require("fs");
let jsyaml  = require("js-yaml");
let sqlite3 = require('sqlite3').verbose(); // Package node-sqlite3, npm install sqlite3
let cproc   = require('child_process');
let hcl     = require('hcl2-parser'); // exp. hcl extension
let cfg = {};
let rarr = []; // AoO w. roles info (from )
let exlist = null; // signify absence (should be AoS)
let db = null; // SQLite

function init(_mcfg) {
  cfg = (_mcfg && _mcfg["gcproles"]) ? _mcfg["gcproles"] : _mcfg;
  if (!cfg) { cfg = {}; }
  let fn = `${process.env["HOME"]}/.linetboot/gcproles.yaml`; // TODO: Also try .json
  if (!fs.existsSync(fn)) { throw "GCP role config does not exist";  }
  let cont = fs.readFileSync(fn, 'utf8');
  // NOTE: "expected a single document in the stream, but found more" - Must use loadAll on multi-document YAML.
  rarr = jsyaml.loadAll(cont);
  if (!rarr || ! Array.isArray(rarr)) { throw "Roles (in YAML) could not be loaded/parsed !"; }
  if (!cfg.rolepermspath) { cfg.rolepermspath = `${process.env["HOME"]}/.linetboot/gcproleperms`; }
  if (!fs.existsSync(cfg.rolepermspath)) {console.log(`Role perms path ${cfg.rolepermspath} does not exist !`);  }
  // Experimental DB support: CREATE TABLE principal_perms (id INTEGER PRIMARY KEY, ptype VARCHAR(128) NOT NULL, pname VARCHAR(128) NOT NULL, role VARCHAR(128) NOT NULL);
  // TODO: projectid VARCHAR(128) NOT NULL
  if (!cfg.roledb) { cfg.roledb = `${process.env["HOME"]}/.linetboot/gcproles.sqlite`; }
  if (fs.existsSync(cfg.roledb)) {
    //sqlite3.verbose();
    let mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX;
    db = new sqlite3.Database(cfg.roledb, mode, function (err) {
      if (err) { console.error(`Error: Opening DB ${cfg.roledb} failed: ${err}`); process.exit(1); }
      console.log(`# Opened connection to: ${cfg.roledb}`);
    }); // ':memory:'

  }
}
// Load Role plain text list with "title" values (line oriented text).
// @return array of lines parsed from file (comment lines and empty lines eliminated)
function rlist_load(fn) {
  if (!fs.existsSync(fn)) { throw `role list '${fn}' does not exist`;  }
  let cont  = fs.readFileSync(fn, 'utf8');
  let lines = cont.split(/\n/);
  lines = lines.map( (l) => { return l.trim(); });
  lines = lines.filter( (l) => { return l && ( ! l.match(/^\s+$/) ); });
  lines = lines.filter( (l) => { return  ! l.match(/^#/); });
  return lines;
}
// Search/Lookup items in role list. Use mod-global rarr to search from.
// For now uses global exlist (exclude list, AoS)
// @return An object with res ([], AoO), notfound ([], AoS) and ambiguous ([], AoS)
function rlist_search(rlist, exact) {
  if (!rlist) { throw "No rlist passed for search."; }
  let arr = []; // Output / Res
  let notfound = [];
  let ambiguous = [];
  //console.log(`EXLIST: ${exlist.length}`);
  rlist.forEach( (rdn) => { // role descriptive name
    // name (e.g. roles/iam.roleAdmin),
    // title (e.g. Role Administrator)
    // description - often same as title
    // Also: string.indexOf(substring) !== -1
    // Use exact match ? Configurable
    let fres = rarr.filter( (ri) => {
      if (exact) { return ri.title == rdn; } // Exact match
      return ri.title.includes(rdn);
    });
    if (!fres || !fres.length) { notfound.push(rdn); return; }
    if (fres.length > 1) {
      let multilist = fres.map( (ri) => { return ri.title; });
      console.log(`Warning: Many results (${fres.length}) for "${rdn}" (${multilist.join(',')})`);
      ambiguous.push(rdn);
      return;
    }
    if (exlist && exlist.includes(fres[0].title)) {
      console.log(`Warning: Role to be marked excluded: ${fres[0].title}`); fres[0].exclude = 1;
    }
    arr.push(fres[0]);
  });
  return {notfound: notfound, res: arr, ambiguous: ambiguous};
}

function hdl_search(req, res) {
  let jr = {status: "err", "msg": "Could not Search roles. "};
  let b = req.body;
  let lines = [];
  if (b.rtext) { lines = cont.split(/\n/); lines = lines.map( (l) => { return l.trim(); }); }
  else if (b.rlines) { lines = b.rlines; }
  else { jr.msg += "No search cliteria roles passed !"; return res.json(jr); }
  let rres = rlist_search(rlines);
  if (!rres) { jr.msg += `No search results for role search (w. ${rlines.length} role titles)`; return res.json(jr); }
  res.json({status: "ok", "data": rres});
}

// Format role search result back to simple text lines w. "name", "title"
function rres_fmt(rres) {
  if (rres.notfound && rres.notfound.length) {
    console.log(`Roles that could not be found: ${rres.notfound.join(', ')}`);
  }
  if (rres.ambiguous && rres.ambiguous.length) {
    console.log(`Roles that had many matches: ${rres.ambiguous.join(', ')}`);
  }
  let i = 1;
  rres.res.forEach( (ri) => { console.log(`${i} ${ri.name}  "${ri.title}"  ${ri.exclude ? "EXCLUDE" : "ok"}`); i++; });
}
function rlist_perms(rres, opts) {
  let perms = {};
  rres.res.forEach( (ri) => {
    let pfn = ri.name.split(/\//)[1] + ".json";
    let apfn = `${cfg.rolepermspath}/${pfn}`;
    if (!fs.existsSync(apfn)) { throw `roleperm list '${apfn}' does not exist`; return; }
    let cont  = fs.readFileSync(apfn, 'utf8');
    let rinfo = JSON.parse(cont);
    console.log(`Got ${rinfo.includedPermissions.length} Perms for "${rinfo.title}" (${rinfo.name})`); ri.permcnt = rinfo.includedPermissions.length;
    rinfo.includedPermissions.forEach( (perm) => {  if (typeof perms[perm] != 'number') { perms[perm] = 0; } perms[perm]++;  });
  });
  console.log(`Aggregared perms from ${rres.res.length} roles: ${Object.keys(perms).length}`);
  if (opts.retres) { return perms; }
  //console.log(perms);
}
let acts = [
  //"search":
  {"id": "search", "title": "Search a (single) role by title.", cb: searchrole},
  //"searchlist":
  {"id": "searchlist", "title": "Search by a role search list (file, pass as first arg.)", cb: searchlist},
  // Cache
  {"id": "cache", "title": "Cache perms of a role / role list.", cb: cacheroleperms},
  // Store
  {"id": "store", "title": "Store roles for a user/group/sa.", cb: store},
  // Output r2p
  {"id": "output", "title": "Output roles-to-members transformed structure.", cb: rolestruct},
  // Roles Aggr. perms
  {"id": "rolesperms", "title": "Aggregated permissions of a role list.", cb: rolesperms},
  // 
  {"id": "exroles", "title": "Extract User/Principal perms (name, not title or desc.). Pass --attr", cb: huserroles},
];
// node gcproles.js exroles /my/path/a.hcl my_r_u a.b@c.com
function huserroles(opts) {
  //let attr = opts.attr || "role_users"; // w. real opts
  let fnh = opts.args[0];
  let attr = opts.args[1];
  let pstr = opts.args[2];
  if (!fnh) { usage("Must pass file as first arg."); }
  if (!attr) { usage("Must pass attr as 2nd arg."); }
  if (!pstr) { usage("Must pass principal (match) string as first arg."); }

  let o;
  try { o = hp(fnh); } catch (ex) { console.error(`Error loading or parsing primary file ${ex}`); }
  //console.log(JSON.stringify(o, null, 2));
  
  let roles = proles_get(o, pstr);
  console.log(`# ${roles.length} roles:\n`+roles.join("\n"));
  // Transfer roles ? Assume same attr
  let fnh_dest = opts.args[3];
  let pstr2 = opts.args[4] || "NNNNN";
  if (!fnh_dest) { return; }
  let o2;
  try { o2 = hp(fnh_dest); } catch (ex) { console.error(`Error loading or parsing secondary file ${ex}`); }
  let rstruct = proles_set(o2, pstr2, roles);
  console.log(`New total roles ${Object.keys(rstruct).length}`);
  let ser = JSON.stringify(rstruct, null, 2);
  rs = ser.replace(/":\s*\[/g, '" = [');
  rs = rs.split(/\n/).map( (l) => { return `  ${l}`;}).join("\n");
  console.log("NEW:"+rs);
  function proles_get(o, pstr) {
    if (!o[attr]) { usage(`${attr} - no such attribute in innards of hcl.`); }
    let rp = o[attr];
    console.log(`Total roles ${Object.keys(rp).length}`);
    //console.log(JSON.stringify(rp, null, 2));
    //let roles = [];
    // Auto-unique (on object) sign: roles = (rp, pstr)
     let roles = Object.keys(rp).filter( (k) => { if (rp[k].includes(pstr)) { return k; }});
     console.log(`Has ${roles.length} roles`);
     return roles;
  }
  // Ret whole structure w. roles added to pstr.
  function proles_set(o, pstr, rarr) {
    if (!pstr) { usage(`No pstr to add`); }
    if (!o[attr]) { usage(`${attr} - no such attribute in innards of hcl.`); }
    let rp = o[attr];
    // Should Drive by union of rp and 
    //Object.keys(rp)
    rarr.forEach( (k) => {
      //if (!rarr.includes(k)) { return; } // Not a role to include - Ignore / leave as-is
      // Consider role (must add)
      if (!Array.isArray(rp[k])) { rp[k] = []; } // Init empty. OLD: console.error(`R: ${k} - value not array`); return;
      else if (rp[k].includes(pstr)) { return; } // Already there - Ignore
      rp[k].push(pstr); // Add !
    });
    return rp;
  }
  function hp (fnh) {
    let cont = fs.readFileSync(fnh, 'utf8');
    let o = hcl.parseToObject(cont);
    o = o[0] ? o[0].inputs : null;
    if (!o) { usage(`Failed to parse HCL file (${fnh}).`); }
    return o;
  }
}
// node gcproles.js searchlist myroles.txt badroles.txt
function searchlist(opts) {
  ////////////// R-List //////////////
  //let rlistfn = process.argv[2];
  let rlistfn = opts.args[0];
  let rlist;try { rlist = rlist_load(rlistfn); } catch (ex) { console.error("No role list passed as (first) argument."); process.exit(1); }
  console.log(`Loaded role-search items (${rlistfn}, ${rlist.length} roles)`);
  console.log(JSON.stringify(rlist, null, 2));
  //////////// Ex-list ////////////
  let exlistfn = opts.args[1]; //process.argv[3];
  if (exlistfn) {
    exlist = rlist_load(exlistfn); // Mod global
    console.log(`Exclude list: ${JSON.stringify(exlist, null, 2)}`);
  }
  ////// Search //////
  let exact = 1; // TODO: from --exact
  let rres = rlist_search(rlist, exact);
  //console.log(JSON.stringify(rres, null, 2));
  console.log(`Found ${rres.res.length} roles for original ${rlist.length} (exact=${exact}, num excludes=${exlist ? exlist.length : 0}).`);
  if (opts.retres) { return rres; }
  rres_fmt(rres);
  //let rres = rlist_search(rlist, exact);rlist_perms(rres);
}
function searchrole(opts) {
  //let skw = process.argv[2]; // OLD: 2
  let skw = opts.args[0];
  let oper = ""; let mkw = null;
  // if (opts.oper && opts.oper.match(/^\S+$/)) { opts.oper = ""; } // Only single token (!) - cancel AND / OR that need multiple operands
  // if (oper) {
  //   mkw = skw.split(/\s+/); // mkw = Multi Keyword
  //   if (mkw.length < 2 ) { console.log("Multiple KW:s expected, but found only single search KW"); }
  //} // AND / OR search
  //if (oper == 'AND') {
  // // // find()? first non match
  // cb = (ri) => { let m = mkw.find( (kw) => { return !ri.includes(kw);  });return !m; };
  //}
  //else if (oper == 'OR') {
  //  // find()? first match
  //  cb = (ri) => { let m = mkw.find( (kw) => { return ri.includes(kw);  });return m; }
  //}
  let res = rarr.filter( (ri) => { return ri.title.includes(skw); });
  console.log(`Results for search by '${skw}'`);
  rres_fmt({res: res});
}
// Cache role permissions gotten from (e.g.) `gcloud iam roles describe roles/editor`
function cacheroleperms(opts) {
  opts.retres = 1;
  rres = searchlist(opts); // (Re-)use CL handler
  console.log(rres);
  // Default: ~/.linetboot/gcproleperms/
  if (!cfg.rolepermspath) { console.log("No roleperms cache path configured"); return; }
  if (!fs.existsSync(cfg.rolepermspath)) { throw `Configured roleperms Cache path (${cfg.rolepermspath}) does not exist.`; return; }
  let arr = [];
  console.log(`# Using input ${opts.args}`);
  rres.res.forEach( (ri) => {
    let dum_rn = ri.name.split(/\//);
    let ofn = `${cfg.rolepermspath}/${dum_rn[1]}.json`;
    let ccmd = `gcloud iam roles describe ${ri.name} --format json`; // > ${ofn}
    console.log(ccmd);
    //arr.push({cmd: ccmd, ofn: ofn, });
    store_rp(ccmd, ofn);
  });
  function store_rp(cmd, ofn) {
    cproc.exec(cmd, function (err, stdout, stderr) {
      if (err) { console.log(`Error executing ${cmd}`); return; }
      fs.writeFileSync( ofn,  stdout , {encoding: "utf8"} );
      console.log(`Wrote: ${ofn}`);
    });
  }
}

function store(opts) {
  // Search 
  opts.retres = 1;
  let rres = searchlist(opts);
  if (process.env['ROLE_PRICIPAL']) { opts.principal = process.env['ROLE_PRICIPAL']; }
  if (!opts.principal) { console.log("Missing principal for storing principal roles."); process.exit(1);}
  if (!db) { console.log("No DB Connection\n"); }
  console.log(`Storing pricipal/role info to ${cfg.roledb}`);
  rres.res.forEach( (ri) => {
    if (ri.exclude) { console.log(`# SKIP Role to exclude: ${ri.title}`); return; }
    let vals = ['group', opts.principal, ri.name];
    let qi = `INSERT INTO principal_perms (ptype, pname, role) VALUES (?, ?, ?);`;
    console.log(`${qi}\nVALUES:${vals.join(',')}`);
    db.run(qi, vals, function (err) {
      if (err) { console.log(`Error: Failed INSERTING: ${err}`); }
      console.log(`Inserted by id=${this.lastID}.`);
    });
  });
}
function rolestruct(opts) {
  // Could do distinct or https://stackoverflow.com/questions/1960473/get-all-unique-values-in-a-javascript-array-remove-duplicates
  //function onlyuniq(value, index, array) {return array.indexOf(value) === index; }
  db.all("SELECT * FROM principal_perms", function (err, rows) {
    if (err) { console.log("Error querying principal roles\n"); process.exit(1); }
    let cnts = {all: rows.length};
    let r2p = {};
    let hcl = 1;
    rows.forEach( (pr) => { r2p[pr.role] = []; }); // Wastefully OR rows.map( (pr) => { return pr.role; }).filter(onlyuniq);
    // or: arr = [...new Set(arr)];
    cnts.unirole = Object.keys(r2p).length;
    rows.forEach( (pr) => { r2p[pr.role].push(`${pr.ptype}:${pr.pname}`); });
    let rs = JSON.stringify(r2p, null, 2);
    if (hcl) { rs = rs.replace(/":\ *\[/g, '" = ['); rs = rs.split(/\n/).map( (l) => { return `  ${l}`;}).join("\n"); }
    console.log(`# Role assignments: ${cnts.all}, Unique Roles: ${cnts.unirole}.`);
    console.log(`rolemems = `+rs);
  });
}


function rolesperms(opts) {
  //let exact = 1;
  opts.retres = 1;
  let rres = searchlist(opts);
  rres.res = rres.res.filter( (ri) => { return !ri.exclude; });
  let perms = rlist_perms(rres, {retres: 1});
  console.log(perms);
}
function usage(msg) {
  if (msg) { console.log(msg); }
  console.log("Subcommands ");
  acts.forEach( (a) => { console.log("- " + a.id + " - " + a.title ); });
  //console.log("Options (each may apply to only certain subcommand)");
  //clopts.forEach( (o) => { console.log("- "+o[1] + " - " + o[2]); });
  process.exit(1);
}

// - Cache role-perms files based on rolelist to cfg.rolepermpath (gen cmds first)
if (process.argv[1].match("gcproles.js")) {
  
  
  var argv2 = process.argv.slice(2);
  var op = argv2.shift();
  if (!op) { usage("No subcommand"); }
  var opnode = acts.find( (an) => { return an.id == op;  });
  if (!opnode) { usage(`Subcommand '${op}' not supported.`); }
  let opts = { args: argv2 };
  //console.log(opnode, opts); // DEBUG !!!
  init();
  //console.log(`Loaded all-roles file (${rarr.length} roles) w. success`);
  var rc = opnode.cb(opts) || 0;
  //console.log(rarr);
  //searchlist();
  //searchrole();
  //process.exit(rc); // synchr. ONLY !
}
