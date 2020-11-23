# Recipe Links to Info & Articles

This section contains links to misc Internet resources related to
OS Install recipes. Linetboot was intially developed largely based on
this information (thanks for all the authors) embedded to (ks.cfg, preseed.cfg)
recipe templates files as "notes".


# Kickstart

Historical note: There was an intial intent to implement Ubuntu install with kickstart recipe format, as there is a support for that, but the
"native format" won on that side.

- Google: Ubuntu kickstart example
- https://help.ubuntu.com/lts/installation-guide/i386/ch04s06.html
- https://gist.github.com/funzoneq/d77369203ea447dc3cc2
- http://gyk.lt/ubuntu-16-04-desktop-unattended-installation/ - Good article on KS and Preseed settings,
   but is based on remastering a CD/DVD
- https://help.ubuntu.com/lts/installation-guide/s390x/apbs02.html
- https://blog.programster.org/kickstart-files
- https://help.ubuntu.com/community/KickstartCompatibility - Ubuntu KS compat. (w. links)
- https://github.com/programster/KVM-Command-Generator
- https://linuxconfig.org/automating-linux-installations-with-kickstart - Excellent elaboration
   on KS params/options
- https://searchitchannel.techtarget.com/feature/Performing-an-automated-Ubuntu-install-using-preseeding
- https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/installation_guide/sect-kickstart-syntax
- https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/installation_guide/s1-kickstart2-options
- https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/installation_guide/ch-parmfiles-Kickstart_parameters
- https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/6/html/installation_guide/sn-automating-installation
- https://gist.github.com/mineiro/5431336 - Centos 6 kickstart
- https://www.linuxtopia.org/online_books/rhel6/rhel_6_installation/rhel_6_installation_s1-kickstart2-options.html
- https://wiki.centos.org/HowTos/PXE/PXE_Setup - Some useful info on how to setup tftp and pxelinux (called syslinux) in CentOS
- https://bugs.centos.org/view.php?id=14221 Centos 7 install problems and ideas / tips for Boot CL

KS & Preseed params: ks=... preseed/file=... preseed/url=http:// (also url=... works)
Preseed commands can be mixed here (for Ubuntu), but must start w. "preseed ...".

# Kernel CL

In both Debian/Ubuntu and native RedHat the kernel CL param is ks=URL
Naming convention for kickstart file (and suffix):

- Debian/Ubuntu: ks.cfg
- Redhat: Early on .ks suffix, nowadays naming like kickstart-NNN.cfg and especially ks.cfg is shown as recommendation.
  - Install-time settings are saved during install as /root/anaconda-ks.cfg
See also
- RUNKS=value (e.g. RUNKS=0, RUNKS=1)
- Kernel CL param: kssendmac (Send MAC address to distinguish machine in special HTTP headers)
- Discovered kernel CL param from /var/log/anaconda.log: BOOTIF=01-14-..... (Mac address, dash separated)
During Install (at least CentOS 6)
- The kickstart file gets downloaded to /tmp/ with name $SOMEHASH-ks.cfg
- Anaconda installer writes a log in /tmp/anaconda.log

# Preseed

## Preseed Config

Generating a good starting file:
```
sudo debconf-get-selections --installer > alloptions.cfg
```
(Depends on debconf-utils, run as sudo to have access). Does NOT Work.
If options are used from kernel CL, there needs to be equal sign (=) between config key and value
AND the value type manifestation (e.g "string", "boolean", ...) should be completely left out.


## Links

Links from preseed template:

- https://help.ubuntu.com/lts/installation-guide/example-preseed.txt
- https://www.debian.org/releases/squeeze/example-preseed.txt
- https://wiki.debian.org/TimeZoneChanges
- https://deployeveryday.com/2015/03/15/install-linux-from-network.html
- https://askubuntu.com/questions/667515/how-do-i-configure-preseed-to-populate-the-hostname-from-dhcp-and-not-stop-at-th - Important artice for netting passed network config (network gets partially
-  configured before preseed gets fetched/processed)
- https://wiki.debian.org/DebianInstaller/Preseed - Valueable doc and links on preseeding
- https://bugs.launchpad.net/ubuntu/+source/preseed/+bug/775670
- https://serverfault.com/questions/470962/ubuntu-preseed-not-using-local-mirror
- https://ubuntuforums.org/showthread.php?t=2387570
- https://github.com/simula/melodic-nornet/blob/master/src/images/preseed.cfg
- https://gist.github.com/bugcy013/4058833
- https://images.validation.linaro.org/kvm/debian-8.3.0-cd1-preseed.cfg
- https://sites.google.com/site/sbobovyc/home/guides/deployment-manager/preseeding Preseeding from CD and PXE
- https://github.com/inukshuk/boxes/blob/master/http/preseed.cfg
- https://www.zyxware.com/articles/2657/how-to-mirror-the-entire-ubuntu-software-repository-locally-and-to-create-your-own-ubuntu-repository-dvds
- https://www.howtoforge.com/local_debian_ubuntu_mirror
- https://askubuntu.com/questions/288334/how-do-i-setup-a-fine-grained-preseed-with-tasksel-set-to-manual
- https://wiki.debian.org/DebianRepository/Format
- https://askubuntu.com/questions/806820/how-do-i-create-a-completely-unattended-install-of-ubuntu-desktop-16-04-1-lts
- https://github.com/core-process/linux-unattended-installation
- https://www.debian.org/releases/wheezy/ia64/apbs05.html.en - Explanation of "seen" and interactivity (Boot: preseed/interactive=true ), Preseed Inclusion
- https://wiki.debian.org/DebianInstaller/Preseed
- Official Ubuntu Server Book
- https://www.debian.org/releases/jessie/i386/ch05s03.html.en - preseed config vars. Discussed in context of passing to kernel CL
- https://diegolemos.net/tag/preseeding/
- https://github.com/nuada/ubuntu-preseed Ubuntu preseed templates
- https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=852158
- http://hands.com/d-i/ - Excellent preseed internals / debug notes
- http://git.hands.com/hands-off - Cgit website with examples
- https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/networking_guide/ch-consistent_network_device_naming Network Device naming conventions
- https://en.wikipedia.org/wiki/Consistent_Network_Device_Naming - Network Device naming (e.g. eth0, em1, eno1 ...)
- https://blog.heckel.xyz/2015/10/18/how-to-create-debian-package-and-debian-repository/
- https://help.ubuntu.com/community/InstallCDCustomization/PreseedExamples
- https://en.wikipedia.org/wiki/Dynamic_Host_Configuration_Protocol
- ftp://supermicro.com/ISO_Extracted/CDR-X9_1.30_for_Intel_X9_platform/Broadcom/Manuals/English/pxe.htm
- https://help.ubuntu.com/lts/serverguide/installing-from-cd.html.en#install-tasks - Some elaboration on package tasks (tasksel)
- https://lists.ubuntu.com/archives/ubuntu-installer/2009-August/000466.html - Includes apt-setup-udeb examples, mirror examples
- https://d-i.debian.org/doc/internals/ch02.html - Lot of excellent high-level info on Debian installer, install phases (also preseed)
- http://ubuntu-on-big-iron.blogspot.com/2017/01/ - preseed and VLAN (also network in general)
- https://wiki.ubuntu.com/S390X/InstallationGuide/AutomatedInstallsWithPreseed (Has link to excellent sample preseed.cfg, see link below)
- https://wiki.ubuntu.com/S390X/InstallationGuide/AutomatedInstallsWithPreseed?action=AttachFile&do=get&target=preseed.cfg
- http://www.vm.ibm.com/education/lvc/LVC0803.pdf IBM Course: Perseed on Ubuntu 16.04
- https://github.com/wnoguchi/ubuntu_documents/blob/master/preseed/preseed.cfg/pxe/basic/preseed.cfg - Comprehensive (japanese) config
- https://qiita.com/wnoguchi/items/9a9092dd23eea88d435f - Japanese (but still readable) article on Ubuntu PXE / preseed (Also good links)
- https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=433568 - Good info on VLAN directives (and preventing it). Also hints of d-i codebase file names
- https://www.debian.org/doc/packaging-manuals/debconf_specification.html (e.g. debconf GET SET FGET (flag set) METAGET, SETTITLE CAPB tags explained)
- https://hands.com/d-i/wheezy/misc/soda/dsd/common.cfg - 2005 preseed
- http://ftp.gnome.org/pub/debian-meetings/2006/debconf6/slides/Debian_installer_workshop-Frans_Pop/paper/index.html


## Validating preseed file
```
    sudo debconf-set-selections -c preseed.cfg
```

# Notes on kernel CLI
MUST have auto=true on kernel CLI ("auto" alone is not enough)
CL option: priority=critical - Only critical questions are asked
priority=critical stops hostname being prompted for (despite settings)
Installer log reveals debconf/priority=high
Also suggested kernel CL: hostname=unassigned-hostname domain=unassigned-domain
DEBCONF_DEBUG=5, Also BOOT_DEBUG=0 (0..3), DEBIAN_FRONTEND=text DEBCONF_PRIORITY=critical (See http://people.debian.org/~bubulle/d-i/vmware-fai.html)
# Ubuntu install log
Some things in: /var/log/installer
- syslog - Normal boot info in syslog, Network (DHCP) discovery, Fetching preseed.cfg, selections of preseed config values
  HDD detection, Ubuntu 18 Netplan creation, late_command execution
- partman - Partition manager related info (Does not have timestamps)
- cdebconf/ - dir with Installer info: questions.dat templates.dat
- initial-status.gz - Package database in its initial state (nothing installed yet)
- status - Package statuses for installer (not installed) packages (? shows 186 packages on ubuntu server)
- lsb-release - Manifestation or current Distro release (This is copied verbatim to /etc/lsb-release)
- See: /usr/share/zoneinfo - Timezone info
