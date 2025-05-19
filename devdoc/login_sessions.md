# HTTP Login Session

Using express-session session handling gets setup (late) during app init

var sesscfg = { secret: ..., cookie: {...} };
app.use(session(sesscfg));
// Middleware handler ONLY after sessions setup.
app.use(linet_mw);
// Set normal / content-producing URL handlers
sethandlers();


// in function linet_mw(req, res, next) { ...



if (req.session && !req.session.qs) {
      // console.log("NO qs, resetting.");
    req.session.qs = [];
  }
console.log("req.sessionID: ", req.sessionID);
  console.log("SS: ", (req.sessionStore ? "present" : "absent"));


function login(req, res) {
  ...
  req.session.user = uent;
  return res.json({status: "ok", data: uent});


function logout(req, res) {
  var jr = {status : "err", msg : "Logout Failed."};
  if (!req.session || !req.session.user) { jr.msg += "User session not found (Did session expire ?)!"; return res.json(jr); }
  req.session.user = null;
  res.json({status: "ok", data: null});
}



See new login_simple()



Set correct login*() handler per config.

