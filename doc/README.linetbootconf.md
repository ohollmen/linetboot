# Linetboot configuration

This section deals with the 2 manually created / maintained files that constitute the Linetboot configuration.
They are (in the order they are loaded when linetboot starts):
- **Hosts Inventory** - The Ansible-style `hosts` list file (with assisteing "host parameters"), which determines which hosts should be covered by
  by Linetboot application. Term *covered* here means "be bootable", "be displayed in hosts inventory" and be generally registered
  with application with lot of information known about them.
- ** Main Config ** (global.conf.json) - Linetboot main config (in JSON format) to configure linetboot direct subsystems or connected subsystems for
  the use of Linetboot. This includes named (JSON) config sections like "inst", "core", "dhcp", "tftp", "net", etc.

## Linetboot "hosts" Inventory (Ansible-style)

Linetboot Configuration is best started by creating the initial "hosts" (inventory) file
( `~/.linetboot/hosts` ). The format for this file follows the ansible inventory file format.
Lines should start with hostname and may be optionally followed by arbitrary `key=value` pairs
that may have meaning to either linetboot, ansible (internally) or ansible playbooks.

Linetboot supports a subset of ansible supported features with following notable points:

- host-lines should be fully suppported
- Concept of "group sections" (e.g. `[web_servers]`) is supported (with current limitation that names must be "symbol-like", no "-" allowed).
- host-lines should not be duplicated with same host(name) appearing multiple times in same inventory file

Even with these limitations there is a good chance you can share the inventory file with Ansible, which is a handy thing if you are
already using Ansible for various host automation tasks.

Note: Linetboot wants the whitespace in parameter values to be escaped by the URL escaping (Hex escape, e.g. %20 for space)  conventions.
However whitespace is rarely needed and the best choice is to simply avoid it.

Example of a small inventory:

```
# Group tags allowed, but not (currently) supported.
# As you can see, '#'-comments are supported too.
[workstations]
# Host parameters / variables are allowed. Linetboot wants spaces to be escaped by '+',
# but you rarely have spaces.
ws-001.comp.com loc=Floor+1 dock=1 nis=west
ws-002.comp.com loc=Floor+3 ansible_user=mrsmith nis=west
[fileservers]
filer-001 nfs=1
dead-005 nossh=1
```

While key names for key-value pairs are arbitrary (and may be used by ansible playbooks), some names have a special meaning
(just as for Ansible) meaning for Linetboot. The list on notable host parameters is:

- loc (str) - Free form host location Indicator (e.g. "West+DC", "Main+Office", etc.)
- use (str) - Brief Usage description (e.g. "MySQL+Prod", "DHCP-Server")
- dock (bool) - Host is running docker (linetboot has ability to show image info for these hosts, e.g. "dock=1")
- nfs (bool) - Host is an NFS server (linetboot can show NFS shares for these hosts)
- bmccreds (str) - Override global BMC (IPMI /RedFish) credentials for this host (in format `user:pass`)
- bmcipaddr (str) - BMC IP Address (when no recorded IPMI info is available)
- bmcuseipmi (bool) - Force use of IPMI for BMC ops, e.g. due to buggy or missing RedFish implementation.
- rfresettype (str) - Use alternative Boot/Reset type when booting host by BMC RedFish interface (Built in Default: PowerCycle,
some values worth trying: GracefulRestart, ForceRestart, PushPowerButton, Nmi. View your "RedFish Info" via linetboot GUI to see what options
your BMC supports)
- ptt (str) - partition table type for host with supported values: "mbr" - Master Boot Record / "gpt" - GUID Partition table
- nbp (str) - Network boot program, bootloader to use for this host (name given by DHCP, available by TFTP) 
- nis (str) - NIS domain name (Like given in /etc/defaultdomain or RH/Centos /etc/sysconfig/network NISDOMAIN=...)
- nisamm (str) - NIS auto-mounter master map (e.g. `auto.master` or `auto_master`. post scripts default to auto.master)
- ibsync (bool) - Fetch info from and sync host with proprietary InfoBlox ip address management system
- preseed (str) - Use an alternative preseed template (or e.g. literal file) for debugging prurposes
- subiud (str) - Use an alternative Subiquity "user-data" template for debugging purposes 

As a reminder (just to associate the connection to ansible and the possibility to share inventory), some ansible supported keys
would be:

- ansible\_user - User to connect to this host as (often not present or overriden by ansible -e / --extra-vars)
- ansible\_sudo\_pass - Ansible sudo password (See also: ansible\_sudo\_password, ansible\_become\_pass, ansible\_become\_password)

Sharing variables / variable names with ansible is okay as long as they have the same conceptual meaning.

### Dynamic population of host key-value params

During server startup it will run a user created custom module, which gets called to do misc setup work.
One common use for this is to populate host params, for example based on hostname (which often have conventions grouping
together a set of hosts with similar patterns in name). See Documentation on main config "lboot_setup_module".
Note: Because these variables are dynamically populated in linetboot runtime data structures, they are **not** available to ansible.
If you must have params/vars available to ansible, you must statically populate them in inventory.

### Effective hosts by 'hosts' file and facts

For host to be considered effective, valid host it must **appear in hosts file** and it **must have facts**.
This means / implies:
- Hosts can be disabled by commenting them out or removing their host-line from hosts file (revert is as easy, remove commenting or add hostline back)  
- Hosts that have a host-line in hosts file, but do not have facts are ineffective

At linetboot startup (in console) there are warning messages displayed on hosts that are registered in hosts, but do not have facts.

## Main Configuration

The linetboot main configuration file is by default expected to be found under the home directory of the user who is
running linetboot server, in the file `~/.linetboot/global.conf.json`. The linetboot codebase has a good default configuration
by same name in the top directory of codebase. The following document sections got through the configuration sections within
linetboot JSON config file, where each section is a "sub-object" within JSON and describes a logical sub-area or sub-system of linetboot.  

The types given in parenthesis below indicate the type of the value in JSON main configuration. The used types are:
- str - String value, surrounded by double quotes
- int - Integer value (*no* quotes)
- bool - Boolean value indicating two possible values. Using integer values 0/1 is fine in most cases
- array-of-str - Array of simple string values (e.g. ["uno","dos","tres"]) 

Path and filename setting in config allow use of "~" to reflect  

### Config Top level

Linetboot top-level config properties are fairly global in nature and widely used in many places of application:

- httpserver (str) - The IP address of linetboot HTTP server with optional port (in addr:port notation).
  Use port 3000 (Express / linetboot default port) unless you know better what you are doing.
  This setting is important (and mainly used on) templates (e.g. bootmenu and generated scripts). Do not use hostname
  as this value gets used in operational contexts where DNS name resolution may not be available.
- nfsserver (str) - NFS file server for special installations that cannot cope with HTTP (E.g. Ubuntu
  18.04 Desktop seems to not work with HTTP) and require an NFS based installation source.
- smbserver (str) - SMB/Samba/CIFS file server to use for special installations (mostly Windows WinPE)
- fact_path (str) - Ansible fact path (See Env. FACT_PATH) for hosts to be properly enabled and have their info
  properly utilizable across the application. Note: this is a single path (not colon separated multi-path string)
- hostnames (array-of-str) - Explicit hostnames that are allowed to be booted/installed by linetboot system. DEPRECATED, do not use.
  These hosts must have their hosts facts recorded in dir registered in FACT_PATH (App init will fail on any host that does not have it's facts down). This is DEPRECATED
- hostsfile (string) - Filename for simple line-per-host text file with hostnames. Alternative to `hostnames` JSON config 
  (array valued) key for hostnames (Default: Current users `~/.linetboot/hosts`).

<!--
- useurlmapping (bool) - map URL:s instead of using using symlinks to loop mounted ISO FS images.
-->
### Section "core" - Essential Linetboot Settings

- maindocroot (str) - The linetboot HTTP server (Express.js) document root for static boot media and OS Install files delivery
- addroot (array-of-str) - Additional document roots for static file delivery (e.g. ["/isoimages", "/usr/local/iso"])
- appname (str) - "Branded" Application name shown in Web frontend of Linetboot (e.g. "DevOps Boot Portal")
- hdrbg (str) - Header Background Image URL for frontend "branding"
- apiena (bool) - N/A
- addroot (array-of-str) - Array of additional document root paths, e.g. for ISO or raw images for the load-into-memory type of boots
  (Note: do not allow filename resolution conflicts to be created when you add more of these. TODO: mention the resolution
  order of these vs. linetboot internally handled URL:s)

### Section "tftp" - TFTP Settings

Linetboot Admin tool (hostsetup.js) can assist in populating TFTP directories with (boot menu, config subdirs, symlinks etc.)
config files and bootloader binaries. The settings for "tftp" are:

- host (str) - Remote host where TFTP server operates. Used in high level contexts where (host)name resolution is available (e.g.
  some linetboot templates for high level purposes) and as DHCP option 66 ("TFTP Server name"). This name should resolve to tftp.ipaddr below.
- ipaddr (str) - IP address of **local or remote** host where TFTP server operates. Used for the generation of DHCP config file (and its next-server variable),
 TFTP Option 150 ("TFTP server address")
  
- root (str) - TFTP server data root directory as absolute path. There's currently expectation of this path matching between
  local TFTP dirs and remote TFTP dirs. A very common value (e.g. among linux distros) for this is "/var/lib/tftpboot/" 
- bootfile (str) - The default/global bootloader file (found under TFTP server) for configuring DHCP server NBP
- menutmpl (str) - PXELinux boot menu template file (Used for generating menu by admin tool and for extracting menu labels and descriptions)
- menutout (int) - Boot menu timeout (In seconds, parameter used for boot menu generation)
- sync (bool) - Flag to sync content (config files, dirs or bootfiles) to remote TFTP server, specified by ipaddr)

<!--
Tentative config vars:

- linftp - Do not use this yet. Flag for using launching linetboot internal TFTP server (which can dynamically serve content for menus, etc)
- menutitle - Boot menu title (TODO) 
-->

### Section "net" - Install time (and general) Network settings

- netmask (str) - Network mask in dotted-quad format (E.g. "255.255.255.0")
- gateway (str) - Gateway IP address in dotted-quad format (E.g. "192.168.1.1")
- namesearch (array-of-str) - DNS name search domains as array (E.g. `["veryclose.net", "near.net", "wayfarther.net"]`)
- nameservers (array-of-str) - DNS nameserver IP addresses in array (E.g.: ["192.168.1.10", "192.168.1.11"]).
- domain (str) - Domainname suffix for local network (E.g. "veryclose.net").
- dev (str) - The default network interface name for the OS being installed (E.g. "eno1")
- ifdefault (str) - Default network interface (NOTE/TODO: disambiguate role of this with "dev" above)
- ntpserver (str) - Network Time Server (hostname or IP)

When new hosts without facts are being installed, Linetboot heavily uses this section to "guess" the good default settings
for network config.

### Section "inst" - OS Installation

Installation Environment universal parameters (with fairly obvious meanings, not documented individually for now) that are used on preseed/kickstart templates:
- locale (str) - Locale name for Language Locale / Char encoding (e.g. "en_US.UTF-8")
- keymap (str) - Keyboard map / layout (E.g. "us")
- time_zone (str) - Timezone of hosts (E.g. "America/Los_Angeles")
- install_recommends (bool) - Debian Installer (D-I only) setting for installing recommended dependencies (Use strictly: true/false)
- postscripts (array-of-str) - Scripts (0 or more) to launch at the end of installation (enter basename only, must be found in `script_path`, see below,
    also note the legacy singular scalar key postscript w. no 's' is supported, but will be discontinued)
- tmpl_path (str) - Template path (':' delimited path string)
- script_path (str) - Script path (':' delimited path string)
- userconfig (str) - OS Install initial user info JSON filename (See also how env. LINETBOOT\_USER\_CONF overrides this).
    This external file should have members:
  - fullname (str) - full firstname, lastname of user
  - username (str) - login username for user
  - password (str) - login password for user (in clear text for now)
  - groups (array-of-str) - The OS groups user should be member of (These groups should be existing out-of-box OS created groups to be on safe side)
  - homedir (str) - Home directory for user
- iprofsconfig (str) - Filename for Installation Profiles Configuration (Initial default value is Linetboot example config, but as you come up with your own (using example as model), its recommended you place it in "~/.linetboot/iprofs.conf.json".

See also "net" section above for install-time network settings (Object with global network base settings).

### Section "postinst" - Post Installation Actions

After OS Installer has completed the installation it is possible to have Lineboot to take further refining (extra) actions on the install client.
Linetboot does this by waiting for host to come up (referred below as "host-up" event/status) and the execute the actions via SSH on host.
Prerequisite for being able to reach host (non-interactively) is to have SSH keys exchanged between install host and linetboot
(by one of the "postscripts" in inst section, see above).

- user (string) - SSH Username for post install activity (hostname / host identity is automatically derived from installation context ip address).
- initwait (int) - Number of seconds to wait before even starting to poll for "host-up"
- pollint" (int) - Poll interval (seconds, default 10s.) for trying to reach 
- trycnt (int) - Number of tries to detect the "host-up" (default: 30 times)
- execact (string) - The shell command to execute on lineboot host shell after "host-up" is detected (Example: "ssh ${POSTOP_USER}@${POSTOP_IP} ls -al /")

Note: The postinst module sets up a set of (very) useful environment variables for shell command given in "execact" to base it's activity on
(See OS Installation documenattion for these environment variables).

Note that in a hi-grade software testing environment, which requires fresh OS install as basis for testing, the "execact" could be the
(direct or indirect - e.g. doing a few DB lookups for right test suite) test command to run on the host.
### Section "ipmi" - Remote Management Info

This section is for BMC based host management and interactivety by IPMI and RedFish (protocols).

- path (str) - Path location for ipmitool collected files (`$hostname.net.users.txt` and `$hostname.net.users.txt`)
- user (str) - Username for IPMI and Redfish
- pass (str) - Password for IPMI and Redfish
- debug (int) - Enable more verbose debug output on remote management ops

Note: for hosts which do not comply to global BMC credentials, there's a way to override credentials on the host level
(See hosts section, bmccreds)

### Section "ldap" - LDAP Authentication settings

Thse settings are used for logging onto Linetboot web UI. Understanding LDAP terminology is useful
for understanding the settings.

- disa (bool) - Force disabling LDAP authentication/connectivity (e.g. temporarily) even if config is complete and working (0/1)
- host (str) - LDAP Server host (add port to end if needed, e.g. "myhost:8389")
- binddn (str) - Bind DN (Distinguished name) for user that LDAP connection is bound as (must be authorized to do searches)
- bindpass (str) - LDAP Bind password for the user (clear, not encrypted)
- userbase (str) - base DN to search users from (LDAP authentication always involves user search as a first step)
- scope (str) - LDAP search scope (base, one, sub). You likely want "sub" here.
- unattr (str) - Username attribute for your LDAP schema (AD: "sAMAccountName", Typical OpenLDAP: "uid")
- idletout (int) - Idle timeout (ms.) for LDAP API
- rebindonerror (bool) - Rebind if error occurs on connection (Default: 1)
- rebindwait (int) - Wait (ms.) delay for binding after client has detected lost connection and is reconnecting (Default: 5000)

### Section "iblox" - InfoBlox IPAM

- url (str) - Web API URL, up to the api version number, no trailing slash (e.g. "https://ipam.company.com/wapi/v2.10")
- user (str) - API Username
- pass (str) - API password
- ro (bool) - Indication that Web API access will be read-only
- syncall (bool) - Consider all inventoried hosts to be synced (not only ones with host parameter ibsync=1)

### Section "recipes" - Additional OS Install Recipes

Recipes section expects an array of recipe objects with following properties:

- url (str) - Recipe (e.g. kickstart, preseed, autoinst.xml) URL as referred to by OS installer (usually set on kernel CL)
- ctype (str) - Recipe config type - a "hint string" for recipe generation (may or may not be used for particular OS installation).
     Keep this unique among all recipes.
- tmpl - Template file Basename or relative path. This file is resolved from the template path (See inst.tmpl_path or env. LINETBOOT_TMPL_PATH)

Adding recipes is an expert option for special OS installations, but may be necessary for:
- OS installations not supported out-of-the-box by Linetboot
- OS Installs that need extreme customization for their recipes

### Section "ansible" - Ansible Runner

- pbpath (str) - Playbook path containing colon-separated paths to possible playbook directories (Format like UNIX/Linux $PATH), order matters in resolving playbooks
- user (str) - Ansible user (This users SSH key must be copied to any remote hosts where ansible playbooks are to be run)
- pass (str) - Ansible remote sudo passwork
- debug (int) - Produce diagnostics messages when running ansible
- pbprofs (AoO) - Arraof of profile objects with
  - name (str) - Descriptive name of Playbook profile
  - lbl (str) - No spaces symbolic name of profile
  - playbooks (arr) - Array of playbook names for this profile

By default the inverntory file used will be the Linetboot inventory.

## Linetboot Environment Variables

Environment Variables that can override settings in main config:

- FACT\_PATH - Ansible facts path (main.fact\_path). Must contain JSON facts files named by hostname (without *.json suffix).
- PKGLIST\_PATH - Path with host package list files.
- LINETBOOT\_GLOBAL\_CONF - Full path to linetboot config file (No corresponding main conf var for obvious reasons).
- LINETBOOT\_USER\_CONF - OS Install Default User config JSON (See example initialuser.json)
- LINETBOOT\_IPTRANS\_MAP - File to simple JSON key-value value to map dynamic addresses to real IP addresses.
- LINETBOOT\_SSHKEY\_PATH - Path with SSH keys in hostname named subdirectories (with keys in them)

While environment variables always have string values (even when describing e.g. integer number), Linetboot will internally
coerce / convert values to correct types. Some variables also allow comma- or semicol. separated values which will be internally processed
into arrays accordingly.

## Internal processing of Environment Variables

As part of configuration processing Linetboot internally:
- Loads main (JSON) configuration into memory 
- Overrides main config values of config from the environment variables storing them in main config
- During app runtime solely utilizes the values found in main config
 

## OS Recipe and Script template PATH:s

The config variables inst.tmpl_path and inst.script_path are (':'-separated) list of directories that contain OS Installation
recipe templates and (templated) scripts respectively.

When script is referred by basename from URL path "/scripts/", the scripts and teplates are searched in order form their
"underlying" respecive paths as "scripts" is just a URL, not a directly mapped static directory.

Example scenarios for templates search from `inst.tmpl_path`: 

- "./tmpl:~/.linetboot/tmpl/" - Search first in linetboot codebase "tmpl" directory and only then form .linetboot/tmpl under
linetboot config directory (where templates and script are copied at install time). This is  a good choice for starter user
who relies on default recipes and does not modify or extreme linetboot developer, who actively changes recipes diretly in codebase
and upstreams them frequently.
- "~/.linetboot/tmpl/:./tmpl" - Opposite: First search under config dir ... . A good choice for user, who changes templates, but
does not have plans to upstream them or only upstreams them much less frequently than doing git-pull updates.

## Auto-detection of features

When linetboot start, it goes through the configuration sections and evaluates
them for completeness and validity. If configuration section is does not have
sufficient data or has invalid data (e.g it names files or dirs that do not exist), the feature associated with config section is marked as disabled.
This disablement reflects all the way to Web GUI, where respective menu
item is suppressed (it disappears).



