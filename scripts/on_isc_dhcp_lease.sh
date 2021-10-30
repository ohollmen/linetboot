#!/usr/bin/python3
# on_isc_dhcp_lease.py - Script to trigger on ISC DHCP Server "on commit" event.
# Sends a notification to Linetboot server (to be further processed)
# See:
# - Google: 
# - REFERENCE: EVENTS (On dhcpd manual) https://kb.isc.org/docs/isc-dhcp-44-manual-pages-dhcpdconf#REFERENCE:%20EVENTS
# - https://stackoverflow.com/questions/51550326/is-there-any-hook-for-finishing-the-dhcpack-in-isc-dhcp-server
# - Jan-Piet Mens on ISC DHCP events https://jpmens.net/2011/07/06/execute-a-script-when-isc-dhcp-hands-out-a-new-lease/
# - Kea Hooks: https://www.isc.org/docs/Winstead_Utilizing_Kea_Hook.pdf
# - https://netbeez.net/blog/linux-dhcp-hooks-network-engineers/
# - https://docs.python-requests.org/en/latest/
# - https://docs.python.org/3/library/urllib.request.html#module-urllib.request
# - https://stackoverflow.com/questions/25491541/python3-json-post-request-without-requests-library
# Example config to go to dhcpd.conf /etc/dhcp/dhcpd.conf subnet section

# on commit {
#   set clip  = binary-to-ascii(10, 8, ".", leased-address);
#   set clmac = binary-to-ascii(16, 8, ":", substring(hardware, 1, 6));
#   # event: commit/release/expire 
#   execute("/usr/local/sbin/on_isc_dhcp_lease.sh", "commit", clip, clmac, host-decl-name);
# }

import sys
# pip install requests
import urllib # urllib3 ?
# import requests
import json
p = sys.argv
cinfo = { event: p[1], ip: p[2], mac: p[3], hname: p[4] }
jdata = json.dumps(cinfo).encode('utf8')
hdrs = { 'content-type': 'application/json' }
url_instev = 'http://{{ httpserver }}}//installevent/lease' # "dhcp_" + event (commit/release/expire)?
# Requests
#r = requests.get(url_instev); #  auth=('user', 'pass')
# r = requests.post(url, data=jdata, headers=hdrs)
# r = requests.post(url, json=cinfo) # > 2.4.2
# print(r.text);
# urllib (Python codre). data=... triggers POST
req = urllib.request.Request(url_instev, data=jdata, headers=hdrs)
response = urllib.request.urlopen(req)
print(response.read().decode('utf8'))

