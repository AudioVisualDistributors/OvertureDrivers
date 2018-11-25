# Display Template (CHANGE ME)

## Overview

Driver for a display (CHANGE ME).
  
## Setup

 - "Host": The IP address or host name of the device. (Default 192.168.1.100)
 - "Port": The port of TCP communication. (Default 20060)

## Variables

### Status

[enum] The current connection status of the device.
 - "Disconnected" : The device is not connected
 - "Connected" : The device is connected, and able to receive commands

### Power

[enum] The power status of the display.
 - "Off": The display is off
 - "On" : The display is on

### Sources

[enum] List of input sources user can select from.
 - "DTV": Change input source to DTV
 - "HDMI1": Change input source to HDMI1
 - "HDMI2": Change input source to HDMI2
 - "HDMI3": Change input source to HDMI3
 - "HDMI4": Change input source to HDMI4

### Audio Level

[integer] Set the audio level of the device.
 - minimum: 0
 - maximum: 100

### Audio Mute

[enum] The mute status of the device.
 - "Off": The device is unmuted
 - "On" : The device is muted

### Channel

[integer] Set the channel of the device.
 - minimum: 1
 - maximum: 99

### Channel Shift

[enum] Shift the channel of the device up or down.
 - "": First val is null, for UI purposes
 - "Up": Change channel up
 - "Down" : Change channel down

## Commands

### Set Power
Turn on or off the device power.
 - "Status": [enum] "On" or "Off" to turn power on or off.

### Select Source
To select the input source to display.
 - "Name": [string] the name of the input source (given by variable "Sources")

### Set Audio Level
Set Audio level of the device (between 0 and 100)
 - "Level": [integer] audio level for the display.

### Set Audio Mute
Mute or unmute the device.
 - "Status": [enum] "On" or "Off" to mute or unmute the display.

### Set Channel
Only available in DTV mode. Set the DTV channel of the display.
 - "Name": [integer] channel for the display.

### Shift Channel
Only available in DTV mode. Shift the DTV channel of the display up or down.
 - "Name": [enum] "Up" or "Down" to change channel accordingly.

## Revisions

### 1.0.0

- Initial version
