# FAQ

Q: Can I use linetboot for non automated or semi-automated install
A: Yes, Strip auto=true from menu file `append` line. This should work at least for Ubuntu/Debian.
Get familiar with your distro linux commandline ooptions to do this. Generally leaving certain "aspects"
out in kickstart/preseed file (Installer config file) - in other words leaving the answers to certain istaller questions out - will make the installer go to
interactive mode and prompt the user to answer to these missing things. Linux installers rarely (and thus fairly) decide things on behalf of installing user, but it's all up to particular distro (and its version) behavior.

Q: Can I use another HTTP server if I suspect a problem with Express static file delivery ?
A: Yes you can, try using Python lightweight HTTP server (we override the port to be Express default port 3000 to avoid regenerating configs):

    python -m SimpleHTTPServer 3000

Note: This basic static file delivery mode of SimpleHTTPServer does not generate appropriate Kisckstart or preseed configs. To do this run the python SimpleHTTPServer for static file delivery and Express for install config generation concurrently on different ports.

Q: What happens if host on which I'm trying to install OS does not have its (Ansible) facts available ?
A: In the name off KISS priciple, current behaviour is Garbage in, garbage out. The Preseed or Kickstart output will be malformatted and your installer will either terminate or fall back to fully manual install mode. It would be nice if installers supported a mode where Preseed or KS config can send an error message displayed by installed with good high level reasoning for terminating (not allowing) installation (E.g. "we do not have sufficient information about your host to proceed with OS install. Please ...").

Q: Is linetboot limited to installing server installations ? can I install desktop Linux with ?
A: lineboot does not have any built in limitations installing Desktop linux. It seems Ubuntu/Canonical wrote a variant of Debian installer called Ubiquity, which may use a variant of Debian-Installer directives or behave differently. Testing current preseed (and creating necessay parametrizations) or creating variation of preseed template for Ubiquity install would be needed.

