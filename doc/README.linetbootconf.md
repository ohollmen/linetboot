# Linetboot configuration

This section deals with the 2 manually created / maintained files that constitute the Linetboot configuration.
They are (in the order they are loaded when linetboot starts):
- **hosts** - The hosts list file (with assisteing "host parameters"), which determines which hosts should be covered by
  by Linetboot application. Term *covered* here means "be bootable", "be displayed in hosts inventory" and be generally registered
  with application with lot of information known about them.
- global.conf.json - Linetboot global config to configure linetboot direct subsystems or connected subsystems for the use of Linetboot.
  This includes named (JSON) config sections like "inst", "core", "dhcp", "tftp", "net"

## Lineboot "hosts" Inventory (Ansible-style)

Lineboot Configuration is best started by creating the initial "hosts" (inventory) file
( `~/.lineboot/hosts` ). The format for this file follows the ansible inventory file format.
Lines should start with hostname and may be optionally followed by arbitrary `key=value` pairs
that may have meaning to either linetboot, ansible (internally) or ansible playbooks.
Linetboot supports a subset of ansible supported features with following notable points:

- host-lines should be fully suppported
- Concept of "groups" is not currently supported.
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
# Host parameters / variables are allowed. Lineboot wants spaces to be escaped by '+',
# but you rarely have spaces.
ws-001.comp.com loc=Floor+1 dock=1 nis=west
ws-002.comp.com loc=Floor+3 ansible_user=mrsmith nis=west
[fileservers]
filer-001 nfs=1
```

While key names for key-value pairs are arbitrary, some names have a special meaning (just as for Ansible) meaning for Lineboot.
The list on notable ones is:

- loc (string) - Free form host location Indicator (e.g. "West+DC")
- use (string) - Brief Usage description (e.g. "MySQL+Prod")
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

### Effective hosts by 'hosts' file and facts

For host to be considered effective, valid host it must **appear in hosts file** and it **must have facts**.
This means / implies:
- Hosts can be disabled by commenting them out or removing their host-line from hosts file (revert is as easy, remove comenting or add hostline bac)  
- Hosts that have a host-line in hosts file, but do not have facts are ineffective

At linetboot startup (in console) there are warning messages displayed on hosts that are registered in hosts, but do not have facts.

## Main Configuration

The lineboot main configuration file is by default expected to be found under the home directory of the user who is
running lineboot server, in the file `~/.linetboot/global.conf.json`. The lineboot codebase has a good default configuration
by same name in the top directory of codebase. The following document sections got through the configuration sections within
linetboot JSON config file, where each section is a "sub-object" within JSON and describes a logical sub-area or sub-system of linetboot.  

### Config Top level

Linetboot top-level config properties are fairly global in nature and widely used in many places of application:

- httpserver - The IP address of linetboot HTTP server with optional port (in addr:port notation).
  Use port 3000 (Express / linetboot default port) unless you know better what you are doing.
  This setting is important (and mainly used on) templates (e.g. bootmenu).
- nfsserver - NFS file server for special installations that cannot cope with HTTP (E.g. Ubuntu
  18.04 Desktop seems to not work with HTTP) and require an NFS based installation source.
- smbserver - SMB/Samba/CIFS file server to use for special installations (mostly Windows WinPE)
- fact_path (str) - Ansible fact path (See Env. FACT_PATH) for hosts to be properly enabled and have their info
  properly utilizable across the application.
- hostnames (array) - Explicit hostnames that are allowed to be booted/installed by linetboot system.
  These hosts must have their hosts facts recorded in dir registered in FACT_PATH (App init will fail on any host that does not have it's facts down). This is DEPRECATED
- hostsfile (string) - Filename for simple line-per-host text file with hostnames. Alternative to `hostnames` JSON config 
  (array valued) key for hostnames (Default: Current users ~/.linetboot/hosts).

<!--
- useurlmapping (bool) - map URL:s instead of using using symlinks to loop mounted ISO FS images.
-->
### Section "core" - Essential Linetboot Settings

- maindocroot (str) - The linetboot HTTP server (Express.js) document root for static boot media and OS Install files delivery
- appname (str) - "Branded" Application name shown in Web frontend of Linetboot
- hdrbg (str) - Header Background Image URL for frontend "branding"
- apiena (bool) - N/A
- addroot (array-of-str) - Array of additional document root paths, e.g. for ISO or raw images for the load-into-memory type of boots
  (Note: do not allow filename resolution conflicts to be created when you add more of these. TODO: mention the resolution
  order of these vs. linetboot internally handled URL:s)

### Section "tftp" - TFTP Settings

Lineboot Admin tool (hostsetup.js) can assist in populating TFTP directories with (boot menu, config subdirs, symlinks etc.)
config files and bootloader binaries. The settings for "tftp" are:

- host - Remote host where TFTP server operates
- ipaddr - IP address of **local or remote** host where TFTP server operates. Used for the generation of DHCP config file
  (and its next-server variable).
- root - TFTP server data (local) root directory
- bootfile - The default/global bootloader file (found under TFTP server) for configuring DHCP server NBP
- menutmpl - PXELinux boot menu template file (Used for generating menu by admin tool and for extracting menu labels and descriptions)
- menutout - Boot menu timeout (In seconds, parameter used for boot menu generation)
- sync - Flag to sync content (config files, dirs or bootfiles) to remote TFTP server, specified by ipaddr)

Tentative config vars:

- linftp - Do not use this yet. Flag for using launching linetboot internal TFTP server (which can dynamically serve content for menus, etc)
- menutitle - Boot menu title (TODO) 

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
- locale - Locale name for Language Locale / Char encoding (e.g. "en_US.UTF-8")
- keymap - Keyboard map / layout (E.g. "us")
- time_zone - Timezone of hosts (E.g. "America/Los_Angeles")
- install_recommends - Debian Installer (D-I only) setting for installing recommended dependencies (true/false)
- postscript - Script to launch at the end of installation (enter basename only, must be found in `script_path`, see below)
- tmpl_path - Template path (':' delimited path string)
- script_path - Script path (':' delimited path string)
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

Note: for hosts which do not comply to global BMC credentials, there's a way to override credentials on the host level
(See hosts section, bmccreds)

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

## Internal processing of Environment Variables

As part of configuration processing Lineboot internally:
- Loads main (JSON) configuration into memory 
- Overrides config values of config from the environment variables
- During app runtime soly utilizes the main config
 

## OS Recipe and Script template PATH:s

The config variables 