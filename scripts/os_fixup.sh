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
grep Ubuntu /etc/os-release
ubu_rc=$?
grep CentOS /etc/os-release
cen_rc=$?
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
# RH/Centos
if [ $cen_rc -eq 0 ]; then
   systemctl stop firewalld; systemctl disable firewalld
   yum list installed -q > ~{{{ username }}}/yum_pkgs.`date -Iminutes`.initial.txt
fi
# Universal, but because of distro file layout (e.g. /etc) differences these may
# target only particular distros.
if [ -f "/etc/selinux/config" ]; then
  perl -pi -e 's/^SELINUX=.+/SELINUX=disabled/;' /etc/selinux/config
fi
# Resolve perl scripts hashbang-line ambiguity
[ ! -e /usr/local/bin/perl ] && ln -s /usr/bin/perl /usr/local/bin/perl

# Ubuntu(18): /etc/pam.d/common-session ... "session	optional	pam_systemd.so " (Note space at end !)
# Avid SSH slow-downs
if [ ! -e "/etc/pam.d/common-session" ]; then
  perl -pi -e 's/^(.+?pam_systemd\.so)/## $1/' /etc/pam.d/common-session
fi
echo "fs.inotify.max_user_watches=524288" >> /etc/sysctl.conf
sysctl -p
# IPMI(tool) Modules
echo -e "ipmi_si\nipmi_devintf" >> /etc/modprobe
modprobe ipmi_si ; modprobe ipmi_devintf
