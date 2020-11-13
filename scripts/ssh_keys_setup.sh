#!/bin/bash
# TEMPLATE_WITH: user
########################### SSH #################
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:{{{ homedir }}}/bin
hash -r
POST_LOG={{{ homedir }}}/post-log.txt

LINET_HNAME=`echo -n {{{ httpserver }}} | cut -d ':' -f 1`
# Generate user SSH keys (and .ssh with correct rights)
/bin/su -l '{{ username }}' -c '/usr/bin/ssh-keygen -t rsa -b 4096 -f {{{ homedir }}}/.ssh/id_rsa -N ""' >> $POST_LOG
echo "Created SSH keys: $?" >> $POST_LOG
# Copy linetboot public key back (can copy direct to ~/.ssh/authorized_keys)
SSH_AKFN={{{ homedir }}}/.ssh/authorized_keys
SSH_HKEY_PATH=/etc/ssh/
SSH_BK_PATH=/etc/ssh/keybackup
/bin/su -l '{{ username }}' -c "/usr/bin/curl -v -X POST -H 'content-type: application/octet-stream' http://{{{ httpserver }}}/keyxchange --data-binary @{{{ homedir }}}/.ssh/id_rsa.pub -o ${SSH_AKFN}" >> $POST_LOG 2>&1
echo "Uploaded self-key and downloaded linet-user-key (for authorized_keys): $?" >> $POST_LOG
chown {{ username }}:{{ username }} ${SSH_AKFN}
mkdir -p $SSH_BK_PATH
cp -p $SSH_HKEY_PATH/ssh_host* $SSH_BK_PATH
echo "Created backup of hostkeys: $?" >> $POST_LOG
### Hostkeys (for /etc/ssh) ####
/usr/bin/curl http://{{{ httpserver }}}/ssh/rsa > $SSH_HKEY_PATH/ssh_host_rsa_key
/usr/bin/curl http://{{{ httpserver }}}/ssh/rsa.pub > $SSH_HKEY_PATH/ssh_host_rsa_key.pub
echo "Downloaded hostkeys to $SSH_HKEY_PATH: $?" >> $POST_LOG
# Add to ~/.ssh/known_hosts
/bin/su -l '{{ username }}' -c "ssh-keyscan -H $LINET_HNAME >> {{{ homedir }}}/.ssh/known_hosts"
echo "Scanned lineboot server hostkeys to known_hosts: $?" >> $POST_LOG

