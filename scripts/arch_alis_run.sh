#!/bin/bash -x
# TEMPLATE_WITH: global
# ALIS (Arch Linux Install Script) based Arch Linux Install orchestraion.
# https://github.com/picodotdev/alis
# Start the system with lastest Arch Linux installation media
# Load keymap
loadkeys us
# Original: Run curl to download and run a (~50 l.) script to download
# and chmod +x ~ 8x scripts that implement the alis system.
# Alt (short-url): curl -sL https://bit.ly/2F3CATp | bash
# curl https://raw.githubusercontent.com/picodotdev/alis/master/download.sh | bash
# Lineboot: in the intrest of minimizing indirection inline the essential downloads
# in here = simlify (e.g. fresh ramdisk => no rm needed, no asciinema,
# no recovery as this is a new install).
export ALIS_COMPS="alis.sh alis-reboot.sh"
export ALIS_GITHUB_BASEURL="https://raw.githubusercontent.com/picodotdev/alis/master"
for script in $ALIS_COMPS
do
  curl -O $ALIS_GITHUB_BASEURL/$script
  chmod a+x $script
done
# Original: Edit alis.conf and change variables values with your preferences
# vim alis.conf
# Linetboot: Download auto-generated alis.conf from linetboot server
curl -O http://{{httpserver}}/alis.conf
echo "Downloaded ALIS scripts and dynamic config to: "`pwd`
# Start Install - will WIPE EVERYTHING on machine and auto-install new Arch !
./alis.sh
