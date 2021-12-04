# Booting VWWare ESXi Guests

## Setting up for BIOS/PXE boot

In ESXi Admin WebGUI:
- choose Guest - Info about guest should appear on the right side of
the screen
- Click "Edit" on the top of the screen
- Choose "VM Options" Tab-button, Open "Boot Options" section
  - Set Firmware: BIOS (select menu of choices BIOS / EFI)
  - Set: "Boot Delay" (E.g.) 8000 milliseconds ( => 8s.)
  - Set: Force BIOS setup (checkbox)
- Click "Save" (Should close the dialog)

## Booting

- Click "Restart" (or do a cycle of "Shut down" / "Power on")
- Press ESC for boot menu (or F12 to "Network Boot")

Note: the guest MAC address should be known to local DHCP server to
correctly assign the IP address and initiate PXE boot.

The MAC Address from "Edit" => "Virtual Hardware" => "MAC Address"
(Uneditable, assigned at Guest VM creation time) will also show on the
screen during the boot (example of failed boot):
```
CLIENT MAC ADDR: 00 0C 31 1C !F CC  GUID: ...
PXE-E52: proxyDHCP offers were received. No DHCP offers were received.

PXE-M0F: Exiting Intel PXE ROM.
Operating System not found.
```


# References

-
https://forums.ivanti.com/s/article/Error-PXE-E52-ProxyDHCP-offers-were-received?language=en_US
