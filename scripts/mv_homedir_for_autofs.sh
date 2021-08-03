#!/bin/bash
# Move Initial user homedir out-of-the-way because Automounting
# will "cover" or "shadow" the subdirs of original /home.
# Not needed in RH/CentOS, because homedir can be directly set in KS.
# Needs to be run as root
# Keep path on root partition.
# TEMPLATE_WITH: user
#export NEW_HOME_PATH=/home_install
export NEW_HOME_PATH=`dirname {{{ user.homedir }}}`
sudo mkdir -p $NEW_HOME_PATH

sudo mv /home/{{ user.username }} $NEW_HOME_PATH/{{ user.username }}

sudo perl -pi -e "s/\/home\/{{ user.username }}/\\$NEW_HOME_PATH\/{{ user.username }}/" /etc/passwd

export PATH=/usr/sbin:/usr/bin:/sbin:/bin:{{{ user.homedir }}}/bin
hash -r
POST_LOG={{{ user.homedir }}}/post-log.txt
touch $POST_LOG; chown {{ user.username }}:{{ user.username }} $POST_LOG
echo "Running as:"`id` >> $POST_LOG
echo User root PATH $PATH >> $POST_LOG
sudo su -l '{{ user.username }}' -c 'echo User(su): $USER PATH: $PATH' >> $POST_LOG
