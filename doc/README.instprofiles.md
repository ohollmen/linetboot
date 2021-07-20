# Installation Profiles

Installation profiles (default: `iprof.conf.json`) are a way to
customize installations for machines in different uses (e.g. a web
server vs. db server vs. build server vs. dhcp server) or different
geographical / physical location (possibly different regions or
countries).

What is mainly customized by a profiles is:
- Localization information (See main config "inst" section, e.g. keyboard, timezone localization)
- Network configuration infrmation (See main config "net" section,
e.g. DNS domain, netmask, gateway, NIS domain and settings)
- Installed packages

The override-information from installation profiles is only taking an
effect for values overriden with explicit (true) value. The missing
key in config obviously has no override effect (but also any false
values currently have no override-effect as all meaningful values have
true value, but this is subject to change).

## Subscribing to an installation profile

In your (ansible-style) host inventory (default: ~/.linetboot/hosts),
add a host key-value variable `iprof=...` with a value that is a valid
key to one of your installation profile JSON config top-level keys.

The key can be added as (based on normal inventory rules):
- as host variable on host line (e.g. "web-001  iprof=webserver")
- Group variable under a group section (from where it is effectively
added to every host of the group, e.g. "[WEB:vars]\niprof=webserver\nuse=Web+Server\n")




