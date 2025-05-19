# Routing, Navigation and GUI Feature suppression.

Pints in application (server & client) lifecycle that affect showing
navigational items in GUI:

- Server config loading and processing:
  - Config gets loaded, env variables get expanded and some superficial
    validation is performed (e.g. mandatory config sections are checked).
  - No radical transformations
  - Sets global.disabled = []; and analyzes some config sections heuristically to see if user wants them activated or not.
- `app.get("/config", config_send);` sends UI-geared config hints to client side:
  - Forwards global.disabled (Array) to client
- Frontend UI / acts_uidisable(actitems): 
  - Uses cfg.disabled (array) early-on (much before menu setup) to remove unnecessary items
  - Only remaining items with property "path" are added to be navigable.
  - However hard wired HTML ul-navigation is (currently) used.


