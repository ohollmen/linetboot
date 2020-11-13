#!/bin/bash
# Move Initial user homedir out-of-the-way because Automounting
# will "cover" or "shadow" the subdirs of original /home.
# Not needed in RH/CentOS, because homedir can be directly set in KS.
# Needs to be run as root
# Keep path on root partition.
# Ref: https://askubuntu.com/questions/777218/debugging-preseed-late-command-for-ubuntu-16-04-server-tee-not-found-vs-nonexis
# TEMPLATE_WITH: user
#export NEW_HOME_PATH=/home_install
export NEW_HOME_PATH=`dirname {{{ homedir }}}`
sudo mkdir -p $NEW_HOME_PATH

sudo mv /home/{{ username }} $NEW_HOME_PATH/{{ username }}

sudo perl -pi -e "s/\/home\/{{ username }}/\\$NEW_HOME_PATH\/{{ username }}/" /etc/passwd

export PATH=/usr/sbin:/usr/bin:/sbin:/bin:{{{ homedir }}}/bin
hash -r
POST_LOG={{{ homedir }}}/post-log.txt
touch $POST_LOG; chown {{ username }}:{{ username }} $POST_LOG
echo "Running as:"`id` >> $POST_LOG
echo User root PATH $PATH >> $POST_LOG
sudo su -l '{{ username }}' -c 'echo User: $USER PATH: $PATH' > $POST_LOG
