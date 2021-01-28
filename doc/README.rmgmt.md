# Remote Management

IPMI and RedFish are remote management technologies (and standards) for
different generations (older and newer respectively).

They could be quickly characterized by:

IPMI
- Older standard (~15+ years), theoretically mature
- Communication implemented by open source tool: `ipmitool`
- Implementations on BMC still suffer from quirks
- Binary protocol, message troubleshootting harder

RedFish
- New standard (~2015 ...), based on HTTP+JSON+REST
- Early implementations suffer from immaturity
- Protocol / communication is easy to debug
- Find PDF docs by (e.g.): iDRAC9 Redfish API Guide

## Remote management Mini FAQ

Q: I'm getting "Get Session Challenge command failed" from ipmitool - what's up with this ?
A: Check your credentials. Check the administrative level (e.g. "user", "administrator", etc) and experiment with -L switch (also check the value in BMC side config). Things that may also help: 1) Reset (reboot) IDrac 2) Have a dedicated network interface for BMC, do not share LOM (LAN on motherboard).

Q: How long does BMC reset take ?
A: Approximately 2 minutes.

## Remote Management References

- The beauty of IPMI (2014) https://www.endpoint.com/blog/2014/08/01/the-beauty-of-ipmi (chassis status, change bootdev, power on)