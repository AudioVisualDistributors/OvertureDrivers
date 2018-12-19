'use strict';

const TICK_PERIOD = 5000;
const POLL_PERIOD = 5000;
const TELNET_TIMEOUT = 10000;  // Socket will timeout after specified milliseconds of inactivity
const SEND_TIMEOUT = 1000;  // Timeout when using telnet send function

let host;
exports.init = _host => {
  host = _host;
};

exports.createDevice = base => {
  const logger = base.logger || host.logger;
  let config;
  let Telnet;
  let telnetClient;

  let frameParser = host.createFrameParser();
  frameParser.setSeparator('Zyper$');
  frameParser.on('data', data => onFrame(data));

  const isConnected = () => { return base.getVar('Status').string === 'Connected'; };

  function setup(_config) {
    config = _config;
    base.setTickPeriod(TICK_PERIOD);

    for (let i = 1; i <= 4; i++) {
      base.createVariable({
        name: `ScreenMode${i}`,
        type: 'enum',
        enums: ['Unknown', 'UHD', '4K', 'Sleep'],
        perform: {
          action: 'setScreenMode',
          params: {ScreenId: i, Mode: '$string'}
        }
      });
    }

    let tempUHD = [], temp4K = [], tempMV = [], usb_sources = ['none'];  // Temp arrays for building the dynamic variable enums

    if (config.encoders.length > 0) {
      config.encoders.forEach(encoder => {
        if (encoder.model === 'ZyperUHD') {
          tempUHD.push(encoder.name);
          if (encoder.usb) usb_sources.push(encoder.usbname);
          else usb_sources.push(encoder.name);
        }
        else if (encoder.model === 'Zyper4K') temp4K.push(encoder.name);
      });
      if (tempUHD.length > 0) {
        tempUHD.sort();
        base.createVariable({ name: 'Encoders_UHD', type: 'enum', enums: tempUHD });
      }
      if (temp4K.length > 0) {
        temp4K.sort();
        base.createVariable({ name: 'Encoders_4K', type: 'enum', enums: temp4K });
      }
    }

    if (config.multiviews.length > 0) {
      config.multiviews.forEach(mv => { tempMV.push(mv.name); });
      base.createVariable({ name: 'Multiviews', type: 'enum', enums: tempMV });
    }

    if (config.videowalls.length > 0) {
      config.videowalls.forEach(vw => {
        let sources = ['Idle'];
        if (vw.model === 'Zyper4K') sources = sources.concat(temp4K);
        else if (vw.model === 'ZyperUHD') sources = sources.concat(tempUHD);
        base.createVariable({
          name: `VideoWall_${vw.name.replace(/[^A-Za-z0-9_]/g, '')}`,  // Ensure legal variable name
          type: 'enum',
          enums: sources,  // Will be populated with appropriate sources above
          perform: {
            action: 'startVideoWall',
            params: { Name: vw.name, Source: '$string' }
          }
        });
      });
    }

    if (config.decoders.length > 0) {
      config.decoders.forEach(decoder => {
        let sources = ['VideoWall'];
        if (decoder.model === 'Zyper4K') sources = sources.concat(temp4K.concat(tempMV));
        else if (decoder.model === 'ZyperUHD') sources = sources.concat(tempUHD);
        base.createVariable({
          name: `Decoder_${decoder.name.replace(/[^A-Za-z0-9_]/g, '')}`,  // Ensure legal variable name
          type: 'enum',
          enums: sources,  // Will be populated with appropriate sources above
          perform: {
            action: 'setDecoder',
            params: { Name: decoder.name, Source: '$string' }
          }
        });
      });
      // Create variables for USB linking between UHD enc/dec
      config.decoders.forEach(decoder => {
        if (decoder.model === 'ZyperUHD') {
          let var_name;
          if (decoder.usb) {
            var_name = `DecoderUSB_${decoder.usbname.replace(/[^A-Za-z0-9_]/g, '')}`;  // Ensure legal variable name
          }
          else {
            var_name = `DecoderUSB_${decoder.name.replace(/[^A-Za-z0-9_]/g, '')}`;  // Ensure legal variable name
          }
          base.createVariable({
            name: var_name,
            type: 'enum',
            enums: usb_sources,  // Will be populated with appropriate sources above
            perform: {
              action: 'setDecoderUsb',
              params: { Name: decoder.name, Source: '$string' }
            }
          });
        }
      });
    }

    base.setPoll({
      action: 'getInfo',
      period: POLL_PERIOD,
      enablePollFn: isConnected,
      startImmediately: true
    });
  }

  function start() {
    Telnet = require('telnet-client');
    initTelnetClient();
  }

  function stop() {
    disconnect();
    if (telnetClient) {
      telnetClient && telnetClient.end();
      telnetClient = null;
    }
  }

  function tick() {
    !telnetClient && initTelnetClient();
  }

  function disconnect() {
    base.getVar('Status').string = 'Disconnected';
  }

  function initTelnetClient() {
    if (!telnetClient) {
      telnetClient = new Telnet();
      logger.silly(`Attempting telnet connection to: ${config.host}:${config.port}`);
      telnetClient.connect({
        host: config.host,
        port: config.port,
        timeout: TELNET_TIMEOUT,
        initialLFCR: true,
        sendTimeout: SEND_TIMEOUT
      });

      telnetClient.on('connect', function () {
        logger.silly('Telnet connected!');
        base.getVar('Status').string = 'Connected';
        base.startPolling();
      });

      telnetClient.on('data', (chunk) => {
        frameParser.push(chunk);
      });

      telnetClient.on('close', function () {
        logger.silly('telnet closed');
        stop();
      });

      telnetClient.on('error', err => {
        logger.error(`telnetClient: ${err}`);
        stop();
      });
    }
  }

  function sendDefer(data) {
    logger.silly(`Telnet sendDefer: ${data}`);
    base.commandDefer(1000);
    telnetClient.send(`${data}\r\n`).then( () => {
      // Handled in onFrame
      // logger.silly(`Telnet send OK: ${data}`)
    }, err => {
      base.commandError(`Telnet send error: ${err}`);
    });
  }

  function setDecoder(params) {
    // Search for source name to determine join mode
    // params.Name params.Source
    let joinmode;
    if (base.getVar('Encoders_UHD').enums.includes(params.Source)) {
      joinmode = 'fast-switched';
    }
    else if (base.getVar('Encoders_4K').enums.includes(params.Source)) {
      joinmode = 'fast-switched'; // Could also be 'genlocked'
    }
    if (base.getVar('Multiviews').enums.includes(params.Source)) {
      joinmode = 'multiview';
    }
    sendDefer(`join ${params.Source} ${params.Name} ${joinmode}`);

    // Set HDMI switcher output accordingly
    let match = params.Name.match(/dec(\d)/);
    let screenId = parseInt(match[1]);  // Hackish way to get the number from the decoder name
    if (params.Name.includes('UHD')) setScreenMode({ScreenId: screenId, Mode: 'UHD'});
    else if (params.Name.includes('4K')) setScreenMode({ScreenId: screenId, Mode: '4K'});
  }

  function setDecoderUsb(params) {
    sendDefer(`join ${params.Source} ${params.Name} usb`);
  }

  function setScreenMode(params) {
    // Sends command to TechLogix HDMI switcher
    let device = [
      '',
      'UHD_dec1',
      'UHD_dec2',
      'UHD_laptop',
      'UHD_dec4'
    ];
    if (params.Mode === 'UHD') sendDefer(`send ${device[params.ScreenId]} rs232 HDMI1%`);
    else if (params.Mode === '4K') sendDefer(`send ${device[params.ScreenId]} rs232 HDMI2%`);
    else if (params.Mode === 'Sleep') sendDefer(`send ${device[params.ScreenId]} rs232 HDMI3%`);  // Switch to unused HDMI input so screens go to sleep
    // 'Unknown' is ignored
  }

  function startVideoWall(params) {
    sendDefer(`set video-wall-encoder ${params.Source} ${params.Name}`);
    // Set HDMI switcher output accordingly for all screens
    for (let i = 1; i <= 4; i++) {
      if (params.Source.includes('UHD')) setScreenMode({ScreenId: i, Mode: 'UHD'});
      else if (params.Source.includes('4K')) setScreenMode({ScreenId: i, Mode: '4K'});
    }
  }

  function onFrame(data) {
    let match;  // Used for regex matching NOTE: [\s\S] will match any character, even newlines
    logger.silly(`onFrame: ${data}`);

    match = data.match(/join (.+?) (.+?) (\S+)[\s\S]*?Success/);
    if (match) {
      base.commandDone();
      if (match[3] === 'usb') base.getVar(`DecoderUSB_${match[2]}`).string = match[1];
      else base.getVar(`Decoder_${match[2]}`).string = match[1];
    }

    match = data.match(/set video-wall-encoder[\s\S]*?Success/);
    if (match) {
      base.commandDone();
    }

    match = data.match(/send (\S+?) rs232 HDMI(\d)[\s\S]*?Success/);
    if (match) {
      let device = [
        '',
        'UHD_dec1',
        'UHD_dec2',
        'UHD_laptop',
        'UHD_dec4'
      ];
      base.commandDone();
      base.getVar(`ScreenMode${device.indexOf(match[1])}`).value = match[2];  // 1 = UHD, 2 = 4K
    }

    // Response from polling command
    match = data.match(/show device config decoders/);
    if (match) {
      base.commandDone();
      // Parse all decoders
      let pattern = /device\.gen.*?name=(.+?),[\s\S]*?connectedEncoder;.*?name=(.+?),.*?connectionMode=(.+)/g;
      match = pattern.exec(data);
      while (match) {
        if (match[3].includes('wall')) base.getVar(`Decoder_${match[1]}`).string = 'VideoWall';
        else base.getVar(`Decoder_${match[1]}`).string = match[2];
        match = pattern.exec(data);
      }

      pattern = /device\.gen.*?name=(.+?),[\s\S]*?usbUplink;.*?name=(\S+)/g;
      match = pattern.exec(data);
      while (match) {
        base.getVar(`DecoderUSB_${match[1]}`).string = match[2];
        match = pattern.exec(data);
      }
    }

  }

  function getInfo() {
    sendDefer('show device config decoders');
  }

  return {
    setup, start, stop, tick,
    setDecoder, setDecoderUsb, setScreenMode, startVideoWall, getInfo
  };
};