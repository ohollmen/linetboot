# Linetboot configuration

## "hosts" Inventory (Ansible-style)

Lineboot Configuration is best started by creating the initial "hosts" (inventory) file
( `~/.lineboot/hosts` ). The format for this file follows the ansible inventory file format.
Lines should start with hostname and may be optionally followed by arbitrary `key=value` pairs
that may have meaning to either linetboot, ansible (internally) or ansible playbooks.
Linetboot supports a subset of ansible supported features with following notable points:

- host-lines should be fully suppported
- Concept of "groups" is not currently supported.
- host-lines should not be duplicated with same host(name) appearing multiple times in same inventory file

Even with these limitations there is a good chance you can share the inventory file with Ansible.

Note: Linetboot wants the whitespace in parameter values to be escaped by the URL escaping (Hex escape, e.g. %20 for space)  conventions.
However whitespace is rarely needed and the best choice is to simply avoid it.

Example of a small inventory:

```
# Group tags allowed, but not (currently) supported.
# As you can see, '#'-comments are supported too.
[workstations]
# Host parameters / variables are allowed. Lineboot wants spaces to be escaped by '+',
# but you rarely have spaces.
ws-001.comp.com loc=Floor+1 dock=1 nis=west
ws-002.comp.com loc=Floor+3 ansible_user=mrsmith nis=west
[fileservers]
filer-001 nfs=1
```

While key names for key-value pairs are arbitrary, some names have a special meaning (just as for Ansible) meaning for Lineboot.
The list on notable ones is:

- loc (sting) - Free form host location Indicator
- use (string) - Brief Usage description
- dock (bool) - Host is running docker (lineboot has ability to show image info for these hosts)
- nfs (bool) - Host is an NFS server (linetboot can show NFS shares for these hosts)
- bmccreds (string) - Override global BMC (IPMI /RedFish) credentials for this host (in format `user:pass`)
- ptt (string) - partition table type "mbr" - Master Boot Record / "gpt" - GUID Partition table

As a reminder (just to associate the connection to ansible and the possibility to share inventory), some ansible supported keys
would be:

- ansible_user - User to connect to this host as (often not present or overriden by ansible -e / --extra-vars)
- ansible\_sudo\_pass - Anisble sudo password

Sharing variables / variable names with ansible is okay as long as they have the same conceptual meaning.

### Dynamic population of host key-value params

During server startup it will run a user created custom module, which gets called to do misc setup work.
One common use for this is to populate host params, for example based on hostname (which often have conventions grouping
together a set of hosts with similar patterns in name). See Documentation on main config "lboot_setup_module".
Note: Because these variables are dynamically populated in linetboot runtime data structures, they are not available to ansible.
If you must have params/vars available to ansible, you must statically populate them in inventory.

## Main Configuration

### Config Top level

Configuration in the main config file `~/.linetboot/global.conf.json` (Currently items with "main." reside on top level):

- main.httpserver - The IP address of linetboot HTTP server with optional port (in addr:port notation).
  Use port 3000 (Express / linetboot default port) unless you know better what you are doing.
  This setting is important (and mainly used on) templates (e.g. bootmenu).
- main.nfsserver - NFS file server for special installations that cannot cope with HTTP (E.g. Ubuntu
  18.04 Desktop seems to be crippled with HTTP)
- main.nfsserver - SMB/Samba/CIFS file server to use for special installations (mostly windows)
- fact_path (str) - Ansible fact path (See Env. FACT_PATH) for hosts to be enabled for install.
- main.useurlmapping (bool) - map URL:s instead of using using symlinks to loop mounted ISO FS images.
- main.hostnames (array) - Explicit hostnames that are allowed to be booted/installed by linetboot system. These hosts must have their hosts facts recorded in dir registered in FACT_PATH (App init will fail on any host that does not have it's facts down). This is DEPRECATED
- main.hostsfile (string) - Filename for simple line-per-host text file with hostnames. Alternative to `hostnames` JSON config 
  (array valued) key for hostnames (Default: Current users ~/.linetboot/hosts).
- tmplfiles (obj) - Object with keys "preseed", "ks" to refer to (Mustache template toolkit) template files to be used for Debian Preseed and RedHat Kickstart configoutput respectively. Tweak only if you need to customize the templates.

### Section "core" - Essential Linetboot Settings

- maindocroot (str) - The linetboot HTTP server (Express.js) document root for static boot media and OS Install files delivery
- appname (str) - "Branded" Application name shown in Web frontend of Linetboot
- hdrbg (str) - Header Background Image URL for frontend "branding"
- apiena (bool) - N/A

### Section "tftp" - TFTP Settings

Lineboot Admin tool (hostsetup.js) can assist in populating TFTP directories with (boot menu, config subdirs, symlinks etc.)
config files and bootloader binaries. The settings for "tftp" are:

- host - Remote host where TFTP server operates
- ipaddr - IP address of **local or remote** host where TFTP server operates. Used for the generation of DHCP config file.
- root - TFTP server data root directory
- linftp - Do not use this yet. Flag for using launching linetboot internal TFTP server (which can dynamically serve content for menus, etc)
- bootfile - The bootloader file for configuring DHCP server NBP
- menutmpl - PXELinux boot menu template file (Used for generating menu by admin tool)
- menutout - Boot menu timeout (In seconds, parameter used for boot menu generation)
- menutitle - Boot menu title (TODO) 
- sync - Flag to sync content (config files, dirs or bootfiles) to remote TFTP server, specified by ipaddr)

### Section "net" - Install time (and general) Network settings

- netmask - Network mask in dotted-quad format (E.g. "255.255.255.0")
- gateway - Gateway IP address in dotted-quad format (E.g. "192.168.1.1")
- namesearch - DNS name search domains as array (E.g. `["veryclose.net", "near.net", "wayfarther.net"]`)
- nameservers - DNS nameservers in array (E.g.: ["192.168.1.10", "192.168.1.11"]).
- domain - Domainname suffix for local network (E.g. "veryclose.net").
- dev - The default network interface name for the OS being installed (E.g. "eno1")
- ifdefault - Default network interface (NOTE/TODO: disambiguate role of this with "dev" above)
- ntpserver - Network Time Server (hostname)

When new hosts without facts are being installed, Linetboot heavily uses this section to "guess" the good default settings
for network config.

### Section "inst" - OS Installation

Installation Environment universal parameters (with fairly obvious meanings, not documented individually for now) that are used on preseed/kickstart templates:
- locale - Locale name for Language Locale / Char encoding (e.g. "en_US.UTF-8")
- keymap - Keyboard map / layout (E.g. "us")
- time_zone - Timezone of hosts (E.g. "America/Los_Angeles")
- install_recommends - Debian Installer (D-I only) setting for installing recommended dependencies (true/false)
- postscript - Script to launch at the end of installation
- userconfig - OS Install initial user info JSON filename (See also how env. LINETBOOT\_USER\_CONF overrides this).
    This external file should have members:
  - fullname - full firstname, lastname of user
  - username - login username for user
  - password - login password for user (in clear text for now)
  - groups - The OS groups user should be member of
  - homedir - Home directory for user

See also "net" section above for install network settings (Object with global network base settings).

### Section "ipmi" - Remote Management Info

This section is for BMC based host management and interactivety by IPMI and RedFish (protocols).

- path - Path location for ipmitool collected files (`$hostname.net.users.txt` and `$hostname.net.users.txt`)
- user - Username for IPMI and Redfish
- pass - Password for IPMI and Redfish
- debug - Enable more verbose debug output on remote management ops

### Section "ldap" - LDAP Authentication settings

- disa - Force disabling LDAP authentication/connectivity (e.g. temporarily) even if config is complete and working (0/1)
- host - LDAP Server host (add port to end if needed, e.g. "myhost:8389")
- binddn - Bind DN (Distinguished name) for user that LDAP connection is bound as (must be authorized to do searches)
- bindpass - LDAP Bind password for the user
- userbase - base to seacrh users from (LDAP authentication always involves user search as a first step)
- scope - LDAP search scope (base, one, sub). You likely want "sub" here.
- unattr - Username attribute for your LDAP schema (AD: "sAMAccountName", Typical OpenLDAP: "uid")
- idletout - Idle timeout for LDAP API
- rebindonerror - Rebind if error occurs on connection (Default: 1)
- rebindwait - Wait delay for binding after client API has encountered and is reconnecting (Default: 5000)

## Linetboot Environment Variables

Environment Variables that can override settings in main config:

- FACT\_PATH - Ansible facts path (main.fact\_path). Must contain JSON facts files named by hostname (without *.json suffix).
- PKGLIST\_PATH - Path with host package list files.
- LINETBOOT\_GLOBAL\_CONF - Full path to lineboot config file (No corresponding main conf var for obvious reasons).
- LINETBOOT\_USER\_CONF - OS Install Default User config JSON (See example initialuser.json)
- LINETBOOT\_IPTRANS\_MAP - File to simple JSON key-value value to map dynamic addresses to real IP addresses.
- LINETBOOT\_SSHKEY\_PATH - Path with SSH keys in hostname named subdirectories (with keys in them)

