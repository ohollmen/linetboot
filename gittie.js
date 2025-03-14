/** @File
* gittie.js - Misc universal Git operations
*/

// Load credentials for a Git server host from .git-credentials file.
// @return credentials (object) w. username and password on success, null
// on failure to find host.
function gcred_load(fn, hn) {
    if (!hn) { console.log("No Git host passed\n"); return null; }
    fn = fn || `${process.env["HOME"]}/.git-credentials`;
    if (!fs.existsSync(fn)) { console.log(`No git creds by name ${fn} found.`); return null; }
    var cont = fs.readFileSync(fn, 'utf8');
    let arr = cont.split("\n");
    console.log(arr); console.log(`Look for '${hn}'`);
    let m = arr.find( function (l) { console.log(`L:${l}, Len: ${l.length}`); return l.includes('github'); }); // "${hn}" l.indexOf(hn) > 1
    console.log(arr);
    if (!m  ) { console.log(`No host matches (for ${hn})`); return null; } //
    //if (arr.length != 1) { console.log(`not unique (${arr.length})`); return null; }
    let url = new URL(m); // [, base] <= burl
    return({password: url.password, username: url.username});
  }

// Create repo on GitHub/GitLab
// Pass: gitorg, reponame
function repo_create(host, p) {
  //if (p.desc) { ghm.description = p.desc; }
  // Similar for: has_issues, has_projects, has_wiki ?
}

module.exports = {
  gcred_load: gcred_load,
  repo_create: repo_create,
  
};
