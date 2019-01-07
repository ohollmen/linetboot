#!/bin/bash
# Move Initial user homedir out-of-the-way because Automounting
# will "cover" or "shadow" the subdirs of original /home.
# Not needed in RH/CentOS, because homedir can be directly set in KS.
# Needs to be run as root
# Keep path on root partition.
# TEMPLATE_WITH: user
#export NEW_HOME_PATH=/home_install
export NEW_HOME_PATH=`dirname {{{ homedir }}}`
sudo mkdir -p $NEW_HOME_PATH

sudo mv /home/{{ username }} $NEW_HOME_PATH/{{ username }}

sudo perl -pi -e "s/\/home\/{{ username }}/\\$NEW_HOME_PATH\/{{ username }}/" /etc/passwd
exit 0
