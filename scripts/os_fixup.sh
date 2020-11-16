#!/bin/bash
# Misc OS Fixups.
# Run this early among post scripts as this may fix mirror repos and improve
# package availability for rest of the setup.
# TODO: Record pkgs here ?
# TEMPLATE_WITH: user

OS_DISTRO_PREV="{{{ distro }}}"

# Detect OS (See also: $OSTYPE, `uname` (Linux), uname -a (Ubuntu))
# https://askubuntu.com/questions/459402/how-to-know-if-the-running-platform-is-ubuntu-or-centos-with-help-of-a-bash-scri
# See: /etc/issue /etc/os-release /etc/redhat-release /etc/lsb-release
grep Ubuntu  /etc/os-release
ubu_rc=$?
grep CentOS /etc/os-release
cen_rc=$?
if [ $ubu_rc -eq 0 ]; then
  # Replace Lineboot host, port and osid pattern with globally good value
  perl -pi -e 's/http:\/\/{{{ httpserver }}}\/ubuntu18\/?/http:\/\/us.archive.ubuntu.com\/ubuntu\//;' /etc/apt/sources.list
  # Or brute -force download overriding file
  #wget "http://{{ httpserver }}/scripts/sources.list" -O /etc/apt/sources.list
  apt-get update
fi
if [ $cen_rc -eq 0 ]; then
   systemctl stop firewalld; systemctl disable firewalld
fi
if [ -f "/etc/selinux/config" ]; then
  perl -pi -e 's/^SELINUX=.+/SELINUX=disabled/;' /etc/selinux/config
fi
