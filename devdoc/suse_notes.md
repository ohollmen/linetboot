# SUSE/openSUSE Notes

# Basic Install

- Software => Patterns: "Minimal Base System"
- With the explicit list (in autoinst.xml): 263 packages

# Suse Packages

A list of potentially useful SW Packages can be seen from Confirmation
screen: Software => Accept => List of packages pops up on a dialog pane => Tab (away from OK/Cancel) to Listing pane => Scroll through list of SW.

Potentially good packages (Try to find better / more detailed descriptions for these):
- aaa_base - openSUSE Base Package
- patterns-base-base - Minimal Base System
- patterns-base-minimal_base - Minimal Appliance Base
- perl and perl-base - See if base system has these (?)
- polkit - Policykit Authorization Framework
- polkit-default-privs - ... default permissions
- python3
- coreutils - GNU Core Utilities
- gawk, grep, file, diffutils
- dbus-1, dbus-1-glib D-Bus ...
- sed, sudo,systemd, timezone, which, xz, pam, mc
- netcfg - Network Conf. Files in /etc
- util-linux,  util-linux-systemd - A coll. of basic system utilities
- nfs-client
- mozilla-nss-certs
- glibc-locale, glibc-locale-base, glibc-locale-base-32bit
- iputils - IPv4 and IPv6 Networking Utilities
- net-tools ?

# Zypper Info

- Cheat sheet: https://en.opensuse.org/images/3/30/Zypper-cheat-sheet-2.pdf
- Search installed / available
  - `zypper search -i` - Search all installed (-i / --installed-only)
  - `zypper search` - Search all available
- Files in package
  - rpm -ql pkgname
- List regitered repos:
  - zypper repos

#  Network and routing

- Genmask (netmask) 0.0.0.0 for default route (Seems "-" means same in suse)
- Destination value default means 0.0.0.0 (in numbers)
- Gateway value _gateway (or gateway) means IP of gateway usually ending with ".1"
- Use route -n to see actual numbers, not symbolic names

Typical routing table (-n .. in numbers) looks like:
```
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         10.75.128.1     0.0.0.0         UG    0      0        0 eno1np0
10.75.128.0     0.0.0.0         255.255.224.0   U     0      0        0 eno1np0
```
Read this:
- Example host 10.75.159.27 ... fits in network 10.75.128.0
  (Netmask 255.255.224.0 => CIDR 19)
- Any traffic in network 10.75.128.0/19 does not go through gateway
- Any traffic outside 

Suse routing XML Section:

```
  <routing>
    <routes config:type="list">
      <route>
        <destination>{{{ net.network }}}</destination>
        <gateway>0.0.0.0</gateway>
        <netmask>{{{ net.netmask }}}</netmask>
	<device>em1</device>
      </route>
        <route>
        <destination>default</destination>
        <gateway>{{{ net.gateway }}}</gateway>
        <netmask>-</netmask>
        <device>em1</device>
      </route>
      
    </routes>
  </routing>
```
Consider:
```
<!--
      <route>
        <destination>default</destination>
        <device>lo</device>
        <gateway>&gateip;</gateway>
        <netmask>-</netmask>
      </route>
      -->
```

# Zypper repos

- Metadata about repos in `/etc/zypp/repos.d/` (one .repo file per repo)
- You can add repos with .treeinfo in dir of URL


# References
- https://landoflinux.com/linux_package_management_zypper.html - Ecellent Zypper command examples (with output)
- openSUSE Networking: https://doc.opensuse.org/documentation/leap/reference/html/book-opensuse-reference/cha-network.html
- Adding routes with "ip": https://www.suse.com/support/kb/doc/?id=000019454
(SLE 15 - Configure a static network address while in the Rescue System)
