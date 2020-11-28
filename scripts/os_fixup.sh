#!/bin/bash
# Misc OS Fixups.
# Run this early among post scripts as this may fix mirror repos and improve
# package availability for rest of the setup.
# TODO: Record (the very initial) pkgs here ?
# TEMPLATE_WITH: user

OS_DISTRO_PREV="{{{ distro }}}"
# /dev/null seems to be needed at least by apt-key and ssh-keygen (!), rights broken in Ubuntu
chmod a+rw /dev/null
# Detect OS (See also: $OSTYPE, `uname` (Linux), uname -a (Ubuntu))
# https://askubuntu.com/questions/459402/how-to-know-if-the-running-platform-is-ubuntu-or-centos-with-help-of-a-bash-scri
# See: /etc/issue /etc/os-release /etc/redhat-release /etc/lsb-release
grep -P '(Debian GNU|Ubuntu)' /etc/os-release
ubu_rc=$?
grep -P '(Red Hat|CentOS)' /etc/os-release
cen_rc=$?
grep 'Arch Linux' /etc/os-release
arch_rc=$?
# "openSUSE Leap"
grep 'openSUSE' /etc/os-release
suse_rc=$?
# ubuntu
if [ $ubu_rc -eq 0 ]; then
  # Replace Lineboot host, port and osid pattern with globally good value
  perl -pi -e 's/http:\/\/{{{ httpserver }}}\/ubuntu18\/?/http:\/\/us.archive.ubuntu.com\/ubuntu\//;' /etc/apt/sources.list
  # Or brute -force download overriding file
  #wget "http://{{ httpserver }}/scripts/sources.list" -O /etc/apt/sources.list
  export DEBIAN_FRONTEND=noninteractive
  dpkg --get-selections > ~{{{ username }}}/dpkg_selections.`date -Iminutes`.initial.txt
  # On package install use -yq
  apt-get update
fi
# RH/Centos (SUSE may also need /etc/sudoers tweak)
if [ $cen_rc -eq 0 ]; then
   #systemctl stop firewalld; systemctl disable firewalld
   systemctl disable --now firewalld
   yum list installed -q | grep -v '^Installed Packages' > ~{{{ username }}}/yum_pkgs.`date -Iminutes`.initial.txt
   # Fix sudoers to allow wheel group to sudo. Assume pristine default RH config.
   # Seems RH 7 already has this line uncommented
   perl -pi -e 's/^#\s*%wheel\s+ALL=(ALL)\s+ALL\b/%wheel\tALL=(ALL)\tALL/;' /etc/sudoers
   # TODO: Fix: /etc/yum.repos.d/CentOS-Base.repo ? Seems no need to do anything (Centos 7)
   # Centos 8 fix (for case where network-scripts installed or ervices --disabled="NetworkManager").
   # Should not hurt other versions.
   # But this warns: network.service is not a native service, redirecting to systemd-sysv-install
   # Executing: /usr/lib/systemd/systemd-sysv-install enable network
   #systemctl enable network
   #TODO: Possibly append to /etc/sysconfig/network
   #echo -e "NETWORKING=yes\n# HOSTNAME=...\nNETWORKING_IPV6=no" >> /etc/sysconfig/network
fi
if [ $arch_rc -eq 0 ]; then
  # Arch Fixups ?
fi
if [ $suse_rc -eq 0 ]; then
  # Suse Fixups ?
  # zypper refresh
  # {{{ homedir }}}/post-log.txt
  /usr/bin/curl "http://{{{ httpserver }}}/autoinst.xml" -o "{{{ homedir }}}/autoinst.xml"
  # Seems SUSE preconfigured users and groups are lacking (e.g. official sudo/wheel group)
  echo "{{ username }} ALL=(ALL) ALL" >> /etc/sudoers
  # Add Internet repo for packages missing from ISO (!)
  zypper addrepo https://download.opensuse.org/distribution/leap/15.2/repo/oss/ os152
  sudo zypper refresh
  # Log packages
  zypper search -i > ~{{{ username }}}/zypper_pkgs.`date -Iminutes`.initial.txt
fi
# Universal, but because of distro file layout (e.g. /etc) differences these may
# target only particular distros.
if [ -f "/etc/selinux/config" ]; then
  perl -pi -e 's/^SELINUX=.+/SELINUX=disabled/;' /etc/selinux/config
fi
# Resolve perl scripts hashbang-line ambiguity
[ ! -e /usr/local/bin/perl ] && ln -s /usr/bin/perl /usr/local/bin/perl
# Record Install-time command-line (NOT: -p). Problem: file is not in chroot
# Per golinuxhub.com /mnt is the mount point
# cp /proc/cmdline /mnt/root/install_time_proc_cmdline

# Ubuntu(18): /etc/pam.d/common-session ... "session	optional	pam_systemd.so " (Note space at end !)
# Avoid SSH slow-downs
# Seems this is created *only* at first boot after install, cannot be done here.
if [ ! -e "/etc/pam.d/common-session" ]; then
  perl -pi -e 's/^(.+?pam_systemd\.so)/## $1/' /etc/pam.d/common-session
fi
echo "fs.inotify.max_user_watches=524288" >> /etc/sysctl.conf
sysctl -p
# IPMI(tool) Modules
echo -e "ipmi_si\nipmi_devintf" >> /etc/modprobe
modprobe ipmi_si ; modprobe ipmi_devintf
