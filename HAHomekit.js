// import {encode, decode} from "@SignalRGB/base64";
// import dtls from "@SignalRGB/dtls";

export function Name() {
  return "Custom Nanoleaf";
}
export function Version() {
  return "1.1.0";
}
export function Type() {
  return "network";
}
export function Publisher() {
  return "WhirlwindFX";
}
export function Size() {
  return [48, 48];
}
// export function DefaultPosition() {return [75, 70]; }
// export function DefaultScale(){return 1.0;}
export function DeviceType() {
  return "wifi";
}

/* global
discovery:readonly
controller:readonly
turnOffOnShutdown:readonly
*/
export function ControllableParameters() {
  return [
    {
      property: "turnOffOnShutdown",
      group: "settings",
      label: "Turn Panels off on Shutdown",
      type: "boolean",
      default: "false",
    },
  ];
}
const BIG_ENDIAN = true;
/** @type {NanoleafDevice} */
let Nanoleaf;
let lastUpdateTime = Date.now();

let ws;
let commandId = 1; // Initialize command ID for Home Assistant API calls
const options = {
  haHost: "192.168.18.37",
  haToken:
    "token",
  haPort: 8123,
  entityId: "light.backlight_nanoleaf_light_strip",
};

function connectToHomeAssistant() {
  device.log("Connecting to Home Assistant...");
  ws = new CustomWebSocket(
    `ws://${options.haHost}:${options.haPort}/api/websocket`
  );

  ws.onopen = () => {
    device.log("Connected to Home Assistant WebSocket");
    ws.send(
      JSON.stringify({
        type: "auth",
        access_token: options.haToken,
      })
    );
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "auth_ok") {
      device.log("Authenticated with Home Assistant");
    } else if (message.type === "auth_invalid") {
      device.log("Authentication failed: " + message.message);
      ws.close();
    }
  };

  ws.onclose = () => {
    device.log("Disconnected from Home Assistant WebSocket");
    // isConnected = false;
    // setTimeout(connectToHomeAssistant, 5000); // Retry connection
  };

  ws.onerror = (err) => {
    device.log("WebSocket error");
  };
}

function sendColorToBulb(rgb) {
  const payload = {
    id: commandId++,
    type: "call_service",
    domain: "light",
    service: "turn_on",
    service_data: {
      entity_id: options.entityId,
      rgb_color: rgb,
    },
  };

  ws.send(JSON.stringify(payload));
}

export function Initialize() {
  device.log("Initializing Custom Nanoleaf plugin");
  device.setName(controller.name);
  device.log(`Setting device name to: ${controller.name}`);

  switch (controller.name.split(" ")[0]) {
    case "Lines":
      device.setImageFromUrl(
        "https://assets.signalrgb.com/devices/brands/nanoleaf/misc/lines.png"
      );
      break;
    case "Canvas":
      device.setImageFromUrl(
        "https://assets.signalrgb.com/devices/brands/nanoleaf/misc/canvas.png"
      );
      break;
    case "Shapes":
      device.setImageFromUrl(
        "https://assets.signalrgb.com/devices/brands/nanoleaf/misc/shapes.png"
      );
      break;
    default:
      device.setImageFromUrl(
        "https://assets.signalrgb.com/devices/brands/nanoleaf/misc/shapes.png"
      );
      break;
  }

  device.addFeature("udp");
  device.addFeature("base64");
  device.addFeature("dtls");
  device.log("Added UDP feature");

  device.log(
    "Obj host " +
      controller.hostname +
      ":" +
      controller.port +
      "@" +
      controller.key
  );
  device.log(
    `Controller details - Host: ${controller.hostname}, Port: ${controller.port}, Key: ${controller.key}`
  );

  if (!Nanoleaf) {
    device.log("Creating new NanoleafDevice instance");
    Nanoleaf = new NanoleafDevice(controller);
    Nanoleaf.ExtractPanelInformation(controller.panelinfo);
    Nanoleaf.InitializeDevice();
  }

  Nanoleaf.openAttempts = 0;
  device.log("Reset open attempts counter");

  connectToHomeAssistant();
}

export function Render() {
  // device.log("Starting Render function");
  const color = device.color(0, 0);
  // device.log("Color data: " + JSON.stringify(color));
}

export function Shutdown(suspend) {
  service.log(`Shutdown called with suspend: ${suspend}`);
  Nanoleaf.streamOpen = false;
  service.log("Set streamOpen to false");

  Nanoleaf.Shutdown();
  service.log("Called Nanoleaf Shutdown");

  if (turnOffOnShutdown) {
    Nanoleaf.protocol.TurnOff();
    service.log("Turned off panels due to turnOffOnShutdown setting");
  }
}

class NanoleafDevice {
  constructor(controller) {
    this.ip = controller.ip;
    this.key = controller.key;
    this.port = controller.port;
    this.streamingPort = 0;
    this.streamOpen = false;
    this.protocol = new NanoleafProtocol(controller);
    this.openAttempts = 0;
    this.MaxAttemptsToOpenStream = 5;
    this.lastOpenAttemptTime = 0;
    this.config = {
      originalBrightness: 100,
      originalEffect: "",
    };
    this.ScaleFactor = 12;
    /** @type {LedPosition} */
    this.size = [0, 0];
    this.lightCount = 0;
    /** @type {NanoLeafPanelInfo[]} */
    this.panels = [];
    this.effectList = [];
    this.firmwareVerion = "0.0.0";
    this.isGen1 = false;
    this.ledNames = [];
    this.ledPositions = [];
    device.log(
      `NanoleafDevice created with IP: ${this.ip}, Port: ${this.port}`
    );
  }

  NormalizeDeviceSize() {
    device.log("Normalizing device size");
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const panel of this.panels) {
      minX = Math.min(minX, panel.x);
      minY = Math.min(minY, panel.y);
      maxX = Math.max(maxX, panel.x);
      maxY = Math.max(maxY, panel.y);
    }

    this.size = [
      Math.ceil(maxX / this.ScaleFactor) + 1,
      Math.ceil(maxY / this.ScaleFactor) + 1,
    ];
    device.log(`Scale Factor: ${this.ScaleFactor}, Ending Size ${this.size}`);
    device.setSize(this.size);
  }

  ExtractPanelInformation(panelConfig) {
    device.log("Extracting panel information");
    this.lightCount = panelConfig.panelLayout.layout.numPanels;
    device.log("Number of lights: " + this.lightCount);

    this.panels = panelConfig.panelLayout.layout.positionData;
    device.log(`Extracted ${this.panels.length} panels`);

    this.firmwareVerion = panelConfig.firmwareVersion;
    device.log(`Controller Firmware Version: ${this.firmwareVerion}`);

    if (Semver.isLessThan(this.firmwareVerion, "6.5.1")) {
      device.log(
        `Panels with firmware lower than 6.5.1 have limited frame rate.`
      );
      this.isGen1 = true;
      device.log("Detected Gen1 panels (firmware < 6.5.1)");
    }

    this.NormalizeDeviceSize();

    this.ledNames = [];
    this.ledPositions = [];

    for (const panel of this.panels) {
      if (panel.panelId === 0) {
        continue;
      }

      this.ledNames.push(`Panel: ${panel.panelId.toString()}`);
      this.ledPositions.push([
        Math.floor(panel.x / this.ScaleFactor),
        Math.floor(panel.y / this.ScaleFactor),
      ]);
    }

    device.setControllableLeds(this.ledNames, this.ledPositions);
    device.log(`Set ${this.ledNames.length} controllable LEDs`);

    const effectsList = [];
    device.log(`Panel Config Effects: ${JSON.stringify(panelConfig.effects)}`);
    for (let i = 0; i < panelConfig.effects.effectsList.length; i++) {
      const effect = panelConfig.effects.effectsList[i];
      if (effect !== "*Dynamic*" && effect !== "*ExtControl*") {
        effectsList.push(effect);
      }
    }
    this.effectList = effectsList;
    device.log(`Extracted ${this.effectList.length} effects`);
  }

  InitializeDevice() {
    device.log("Initializing device");
    device.log(`Fetching Current Hardware Config...`);
    const currentBrightness = this.protocol.GetBrightness();
    if (currentBrightness.value !== undefined) {
      this.config.originalBrightness = currentBrightness.value;
      device.log(`Got brightness: ${this.config.originalBrightness}`);
    } else {
      device.log("Failed to read device brightness. Defaulting to 100...");
      this.config.originalBrightness = 100;
      device.log("Defaulted brightness to 100 due to read failure");
    }

    device.log(`Current Brightness: ${this.config.originalBrightness}`);
    const currentEffect = this.protocol.GetCurrentEffect();
    if (typeof currentEffect !== "string") {
      this.config.originalEffect = "Unknown";
      device.log("Current effect set to Unknown");
    } else if (
      currentEffect !== "*Dynamic*" &&
      currentEffect !== "*ExtControl*"
    ) {
      this.config.originalEffect = currentEffect;
      device.log(`Current effect: ${this.config.originalEffect}`);
    }

    device.log(`Current Effect: ${this.config.originalEffect}`);
    this.protocol.SetBrightness(100);
    device.log("Set brightness to 100");
    this.StartStream();
  }

  StartStream() {
    device.log(`Starting stream with key: ${this.key}`);
    const result = this.protocol.StartStreamV2();
    if (result) {
      this.streamOpen = true;
      this.streamingPort = result.streamingPort;
      device.log(`Stream started successfully on port ${this.streamingPort}`);
    } else {
      device.log("Failed to start stream");
    }
  }

  Shutdown() {
    device.log("Shutting down device");
    device.log(`Setting device back to previous settings...`);
    device.log(`Orignal Brightness: ${this.config.originalBrightness}`);
    this.protocol.SetBrightness(this.config.originalBrightness);
    device.log(`Restored brightness to ${this.config.originalBrightness}`);

    device.log(`Orignal Effect: ${this.config.originalEffect}`);
    if (this.config.originalEffect === "" && this.effectList.length > 0) {
      device.log(
        `Shutdown(): invalid original effect. Setting to first effect found: [${this.effectList[0]}]`
      );
      this.protocol.SetCurrentEffect(this.effectList[0]);
      device.log(
        `Set effect to ${this.effectList[0]} due to invalid original effect`
      );
      return;
    }

    this.protocol.SetCurrentEffect(this.config.originalEffect);
    device.log(`Restored effect to ${this.config.originalEffect}`);
  }

  SendColorsv1() {
    device.log("Sending colors using v1 protocol");
    const packet = [];
    packet[0] = this.lightCount;

    for (const [iIdx, lightinfo] of this.panels.entries()) {
      const startidx = 1 + iIdx * 7;
      packet[startidx + 0] = lightinfo.panelId;
      packet[startidx + 1] = 1; // reserved
      const x = this.size[0] - lightinfo.x / this.ScaleFactor - 1;
      const y = lightinfo.y / this.ScaleFactor;
      const col = device.color(x, y);
      packet[startidx + 2] = col[0]; //r
      packet[startidx + 3] = col[1]; //g
      packet[startidx + 4] = col[2]; //b
      packet[startidx + 5] = 0; //w
      packet[startidx + 6] = 0; //transition time * 100ms
    }

    if (this.streamOpen) {
      udp.send(this.ip, this.streamingPort, packet, BIG_ENDIAN);
      device.log(`Sent color packet to ${this.ip}:${this.streamingPort}`);
    }
  }

  SendColorsv2() {
    device.log("Sending colors using v2 protocol");
    const packet = [];
    packet[0] = 0;
    packet[1] = this.lightCount;

    for (const [iIdx, lightinfo] of this.panels.entries()) {
      const startidx = 2 + iIdx * 8;
      packet[startidx] = (lightinfo.panelId >> 8) & 0xff;
      packet[startidx + 1] = lightinfo.panelId & 0xff; // reserved
      const x = this.size[0] - lightinfo.x / this.ScaleFactor - 1;
      const y = lightinfo.y / this.ScaleFactor;
      const col = device.color(x, y);
      packet[startidx + 2] = col[0]; //r
      packet[startidx + 3] = col[1]; //g
      packet[startidx + 4] = col[2]; //b
      packet[startidx + 5] = 0; //w
      packet[startidx + 6] = 0; //transition time * 100ms
      packet[startidx + 7] = 1;
    }

    if (this.streamOpen) {
      udp.send(this.ip, this.streamingPort, packet, BIG_ENDIAN);
      device.log(`Sent v2 color packet to ${this.ip}:${this.streamingPort}`);
    }
  }
}

class NanoleafProtocol {
  constructor(controller) {
    this.ip = controller.ip;
    this.port = controller.port;
    this.key = controller.key;
    device.log(
      `NanoleafProtocol created for IP: ${this.ip}, Port: ${this.port}, Key: ${this.key}`
    );
  }

  StartStreamV1() {
    device.log("Attempting to start v1 stream");
    let output = {};
    XmlHttp.Put(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/effects`,
      (xhr) => {
        if (xhr.readyState === 4 && xhr.status === 200) {
          const result = JSON.parse(xhr.response);
          output = result;
          device.log("v1 stream started successfully");
        }
      },
      {
        write: {
          command: "display",
          animType: "extControl",
          extControlVersion: "v1",
        },
      }
    );
    return output;
  }

  StartStreamV2() {
    device.log("Attempting to start v2 stream");
    const instance = this;
    let output = {};
    XmlHttp.Put(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/effects`,
      (xhr) => {
        if (xhr.readyState === 4 && xhr.status === 204) {
          output = {
            streamingAddress: instance.ip,
            streamingPort: 60222,
          };
          device.log("v2 stream started successfully");
        }
      },
      {
        write: {
          command: "display",
          animType: "extControl",
          extControlVersion: "v2",
        },
      }
    );
    return output;
  }

  GetCurrentEffect() {
    device.log("Getting current effect");
    let output = { error: true };
    XmlHttp.Get(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/effects/select`,
      (xhr) => {
        if (xhr.readyState === 4) {
          if (xhr.responseText) {
            output = JSON.parse(xhr.responseText);
            device.log(`Current effect retrieved: ${JSON.stringify(output)}`);
          } else {
            device.log(
              `GetCurrentEffect(): Command Failed with status: ${xhr.status}`
            );
            device.log(`Failed to get current effect, status: ${xhr.status}`);
          }
        }
      }
    );
    return output;
  }

  SetCurrentEffect(effectName) {
    device.log(`Setting effect to: ${effectName}`);
    let output = false;
    XmlHttp.Put(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/effects`,
      (xhr) => {
        if (xhr.readyState === 4) {
          if (xhr.status === 204) {
            output = true;
            device.log(`Effect set successfully: ${effectName}`);
          } else {
            device.log(
              `SetCurrentEffect(): Command Failed with status: ${xhr.status}`
            );
            device.log(`Failed to set effect, status: ${xhr.status}`);
          }
        }
      },
      {
        select: effectName,
      }
    );
    return output;
  }

  GetCurrentState() {
    device.log("Getting current state");
    let output = { error: true };
    XmlHttp.Get(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/state`,
      (xhr) => {
        if (xhr.readyState === 4) {
          if (xhr.responseText) {
            output = JSON.parse(xhr.responseText);
            device.log(`Current state retrieved: ${JSON.stringify(output)}`);
          } else {
            device.log(
              `GetCurrentState(): Command Failed with status: ${xhr.status}`
            );
            device.log(`Failed to get current state, status: ${xhr.status}`);
          }
        }
      }
    );
    return output;
  }

  GetCurrentOnOffState() {
    device.log("Getting current on/off state");
    let output = { value: false };
    XmlHttp.Get(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/state/on`,
      (xhr) => {
        if (xhr.readyState === 4) {
          if (xhr.responseText) {
            output = JSON.parse(xhr.responseText);
            device.log(`On/off state retrieved: ${JSON.stringify(output)}`);
          } else {
            device.log(
              `GetCurrentOnOffState(): Command Failed with status: ${xhr.status}`
            );
            device.log(`Failed to get on/off state, status: ${xhr.status}`);
          }
        }
      }
    );
    return output.value;
  }

  TurnOn() {
    device.log("Turning on device");
    let output = false;
    XmlHttp.Put(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/state`,
      (xhr) => {
        if (xhr.readyState === 4) {
          if (xhr.status === 204) {
            output = true;
            device.log("Device turned on successfully");
          } else {
            device.log(`TurnOn(): Command Failed with status: ${xhr.status}`);
            device.log(`Failed to turn on device, status: ${xhr.status}`);
          }
        }
      },
      { on: { value: true } }
    );
    return output;
  }

  TurnOff() {
    device.log("Turning off device");
    let output = false;
    XmlHttp.Put(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/state`,
      (xhr) => {
        if (xhr.readyState === 4) {
          if (xhr.status === 204) {
            output = true;
            device.log("Device turned off successfully");
          } else {
            device.log(`TurnOff(): Command Failed with status: ${xhr.status}`);
            device.log(`Failed to turn off device, status: ${xhr.status}`);
          }
        }
      },
      { on: { value: false } }
    );
    return output;
  }

  GetBrightness() {
    device.log("Getting brightness");
    let output = { error: true };
    XmlHttp.Get(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/state/brightness`,
      (xhr) => {
        if (xhr.readyState === 4) {
          if (xhr.responseText) {
            output = JSON.parse(xhr.responseText);
            device.log(`Brightness retrieved: ${JSON.stringify(output)}`);
          } else {
            device.log(
              `GetBrightness(): Command Failed with status: ${xhr.status}`
            );
            device.log(`Failed to get brightness, status: ${xhr.status}`);
          }
        }
      }
    );
    return output;
  }

  SetBrightness(brightness) {
    device.log(`Setting brightness to: ${brightness}`);
    let output = false;
    XmlHttp.Put(
      `http://${this.ip}:${this.port}/api/v1/${this.key}/state/brightness`,
      (xhr) => {
        if (xhr.readyState === 4) {
          if (xhr.status === 204) {
            output = true;
            device.log(`Brightness set to ${brightness}`);
          } else {
            device.log(
              `SetBrightness(): Command Failed with status: ${xhr.status}`
            );
            device.log(`Failed to set brightness, status: ${xhr.status}`);
          }
        }
      },
      {
        brightness: { value: brightness },
      }
    );
    return output;
  }
}

export function DiscoveryService() {
  this.IconUrl = "https://assets.signalrgb.com/brands/nanoleaf/logo.png";
  this.MDns = ["_nanoleafapi._tcp.local."];
  this.firstRun = true;
  this.cache = new IPCache();

  this.Initialize = function () {
    service.log("Initializing Discovery Service for Custom Nanoleaf");
    service.log("Searching for network devices...");

    // Add fake controller
    const fakeController = {
      id: "fake-nanoleaf-001",
      hostname: "localhost",
      name: "Bulb",
      port: 16021,
      firmwareVersion: "0.0.1",
      model: "NL55",
      ip: "192.168.18.37",
    };
    service.log("Adding fake controller for testing");
    this.CreateController(fakeController);
  };

  this.Update = function () {
    service.log("Running Discovery Service Update");
    for (const cont of service.controllers) {
      service.log(`Updating controller *: ${cont.name}`);
      cont.obj.update();
      service.log(`Updated controller: ${cont.name}`);
    }

    if (this.firstRun) {
      this.firstRun = false;
      this.LoadCachedDevices();
      service.log("Completed first run, loaded cached devices");
    }
  };

  this.Discovered = function (value) {
    service.log(`New host discovered: ${JSON.stringify(value)}`);
    this.CreateController(value);
  };

  this.Removal = function (value) {
    service.log(`${value.hostname} was removed from the network!`);
  };

  this.LoadCachedDevices = function () {
    service.log("Loading cached devices");
    for (const [key, value] of this.cache.Entries()) {
      service.log(`Found cached device: [${key}: ${JSON.stringify(value)}]`);
      this.CreateController(value);
    }
  };

  this.CreateController = function (value) {
    service.log(`Creating controller for: ${value.name || value.hostname}`);
    const controller = service.getController(value.id);
    if (controller === undefined) {
      service.addController(new NanoleafBridge(value));
      service.log(`Added new controller: ${value.name}`);
    } else {
      controller.updateWithValue(value);
      service.log(`Updated existing controller: ${controller.name}`);
    }
  };

  this.forgetController = function (id) {
    service.log(`Forgetting controller with ID: ${id}`);
    this.cache.Remove(id);
    for (const controller of service.controllers) {
      if (controller.id === id) {
        service.suppressController(controller);
        service.removeController(controller);
        service.log(`Controller ${id} removed`);
        return;
      }
    }
  };
}

class NanoleafBridge {
  constructor(value) {
    this.updateWithValue(value);
    this.key = service.getSetting(this.id, "key") ?? "";
    this.connected = this.key != "";
    this.waitingforlink = false;
    this.retriesleft = 60;
    this.ip = "";
    this.deviceCreated = false;
    this.panelinfo = undefined;
    this.lastPollTime = 0;
    this.currentlyValidatingIP = false;
    this.failedToValidateIP = false;
    this.currentlyResolvingIP = false;
    service.log(`Constructing NanoleafBridge for: ${this.name}`);

    if (value?.ip) {
      this.ValidateIPAddress(value?.ip);
    } else {
      this.ResolveIpAddress();
    }
  }

  ValidateIPAddress(ip) {
    service.log(`Validating IP address: ${ip}`);
    this.currentlyValidatingIP = true;
    service.updateController(this);
    const instance = this;
    instance.ip = ip;
    // XmlHttp.Post(`http://${ip}:${this.port}/api/v1/new`, (xhr) => {
    // 	service.log(`ValidateIPAddress: State: ${xhr.readyState}, Status: ${xhr.status}`);
    // 	if(xhr.readyState === 4){
    // 		if(xhr.status === 403){
    // 			service.log(`IP ${ip} validated successfully`);
    // 			instance.ip = ip;
    // 		}
    // 		if(xhr.status === 0){
    // 			service.log(`Error: IP ${ip} validation failed`);
    // 			instance.failedToValidateIP = true;
    // 			instance.ResolveIpAddress();
    // 		}
    // 		instance.currentlyValidatingIP = false;
    // 		service.updateController(instance);
    // 	}
    // },
    // {/* No Data*/},
    // true);
  }

  cacheControllerInfo() {
    service.log(`Caching controller info for ID: ${this.id}`);
    discovery.cache.Add(this.id, {
      hostname: this.hostname,
      name: this.name,
      port: this.port,
      firmwareVersion: this.firmwareVersion,
      model: this.model,
      id: this.id,
      ip: this.ip,
    });
  }

  updateWithValue(value) {
    this.hostname = value?.hostname;
    this.name = value?.name ?? "Unknown Name";
    this.port = value.port;
    this.firmwareVersion = value.srcvers ?? value.firmwareVersion;
    this.model = value.md ?? value?.model ?? "Unknown Model";
    this.id = value.id;
    service.updateController(this);
    service.log(`Updated controller with value: ${JSON.stringify(value)}`);
  }

  ResolveIpAddress() {
    service.log(`Resolving IP address for hostname: ${this.hostname}`);
    this.currentlyResolvingIP = true;
    service.updateController(this);
    const instance = this;
    service.resolve(this.hostname, (host) => {
      if (instance.ip != "") {
        return;
      }
      if (host.protocol === "IPV4") {
        instance.ip = host.ip;
        service.log(`Resolved IPV4 address: ${host.ip}`);
        instance.cacheControllerInfo();
        this.currentlyResolvingIP = false;
        this.failedToValidateIP = false;
        service.updateController(instance);
      } else if (host.protocol === "IPV6") {
        service.log(`Skipping IPV6 address: ${host.ip}`);
      } else {
        service.log(`Unknown IP config: ${JSON.stringify(host)}`);
      }
    });
  }

  update() {
    service.log(`Updating controller: ${this.name}`);
    if (this.waitingforlink) {
      this.retriesleft--;
      this.makeRequest();
      service.log(`Waiting for link, retries left: ${this.retriesleft}`);
      if (this.retriesleft <= 0) {
        this.waitingforlink = false;
        service.log("Link retries exhausted");
      }
      service.updateController(this);
      return;
    }

    if (this.ip === "") {
      service.log("No IP address, skipping update");
      return;
    }

    if (this.connected && !this.panelinfo) {
      this.getClusterInfo();
      service.log("Fetching cluster info");
    }
  }

  setKey(response) {
    service.log(`Setting key: ${response.auth_token}`);
    this.key = response.auth_token;
    service.saveSetting(this.id, "key", this.key);
    this.retriesleft = 0;
    this.waitingforlink = false;
    this.connected = true;
    service.updateController(this);
  }

  getClusterInfo() {
    service.log(
      `Requesting panel info from: http://${this.ip}:${this.port}/api/v1/${this.key}/`
    );
    const instance = this;
    instance.setDetails({
      firmwareVersion: "0.0.1",
      name: "Bulb",
      model: "NL55",
      panelLayout: {
        layout: { numPanels: 1, positionData: [{ panelId: 1, x: 0, y: 0 }] },
      },
      effects: { effectsList: [] },
    });
    // XmlHttp.Get(`http://${this.ip}:${this.port}/api/v1/${this.key}/`, (xhr) => {
    // 	if (xhr.readyState === 4 && xhr.status === 200) {
    // 		service.log("Panel info retrieved successfully");
    // 		instance.setDetails(JSON.parse(xhr.response));
    // 	}
    // }, true);
  }

  makeRequest() {
    service.log(`Making request to: http://${this.ip}:${this.port}/api/v1/new`);
    const instance = this;
    instance.setKey({ auth_token: "asdf" });
    // XmlHttp.Post(`http://${this.ip}:${this.port}/api/v1/new`, (xhr) => {
    // 	service.log(`Make Request: State: ${xhr.readyState}, Status: ${xhr.status}`);
    // 	if (xhr.readyState === 4 && xhr.status === 200) {
    // 		instance.setKey(JSON.parse(xhr.response));
    // 	}
    // },
    // {/* No Data*/},
    //  true);
  }

  setDetails(response) {
    this.panelinfo = response;
    this.firmwareVersion = response.firmwareVersion;
    this.hostname = response.name;
    this.model = response.model;
    service.log(`Set details: ${JSON.stringify(response)}`);
    this.cacheControllerInfo();
    service.updateController(this);

    if (!this.deviceCreated) {
      this.deviceCreated = true;
      service.announceController(this);
      service.log("Announced new controller");
    }
  }

  startLink() {
    service.log(`Starting link for: ${this.name}`);
    this.retriesleft = 60;
    this.waitingforlink = true;
    service.updateController(this);
  }
}

// Swiper no XMLHttpRequest boilerplate!
class XmlHttp {
  static Get(url, callback, async = false) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, async);

    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = callback.bind(null, xhr);

    xhr.send();
  }

  static Post(url, callback, data, async = false) {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", url, async);

    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = callback.bind(null, xhr);

    xhr.send(JSON.stringify(data));
  }
  static Delete(url, callback, data, async = false) {
    const xhr = new XMLHttpRequest();
    xhr.open("DELETE", url, async);

    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = callback.bind(null, xhr);

    xhr.send(JSON.stringify(data));
  }
  static Put(url, callback, data, async = false) {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, async);

    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = callback.bind(null, xhr);

    xhr.send(JSON.stringify(data));
  }
}
class IPCache {
  constructor() {
    this.cacheMap = new Map();
    this.persistanceId = "ipCache";
    this.persistanceKey = "cache";

    this.PopulateCacheFromStorage();
  }
  Add(key, value) {
    service.log(`Adding ${key} to IP Cache...`);

    this.cacheMap.set(key, value);
    this.Persist();
  }

  Remove(key) {
    this.cacheMap.delete(key);
    this.Persist();
  }
  Has(key) {
    return this.cacheMap.has(key);
  }
  Get(key) {
    return this.cacheMap.get(key);
  }
  Entries() {
    return this.cacheMap.entries();
  }

  PopulateCacheFromStorage() {
    service.log("Populating IP Cache from storage...");

    const storage = service.getSetting(this.persistanceId, this.persistanceKey);

    if (storage === undefined) {
      service.log(`IP Cache is empty...`);

      return;
    }

    let mapValues;

    try {
      mapValues = JSON.parse(storage);
    } catch (e) {
      service.log(e);
    }

    if (mapValues === undefined) {
      service.log("Failed to load cache from storage! Cache is invalid!");

      return;
    }

    if (mapValues.length === 0) {
      service.log(`IP Cache is empty...`);
    }

    this.cacheMap = new Map(mapValues);
  }

  Persist() {
    service.log("Saving IP Cache...");
    service.saveSetting(
      this.persistanceId,
      this.persistanceKey,
      JSON.stringify(Array.from(this.cacheMap.entries()))
    );
  }

  DumpCache() {
    for (const [key, value] of this.cacheMap.entries()) {
      service.log([key, value]);
    }
  }
}

class Semver {
  static isEqualTo(a, b) {
    return this.compare(a, b) === 0;
  }
  static isGreaterThan(a, b) {
    return this.compare(a, b) > 0;
  }
  static isLessThan(a, b) {
    return this.compare(a, b) < 0;
  }
  static isGreaterThanOrEqual(a, b) {
    return this.compare(a, b) >= 0;
  }
  static isLessThanOrEqual(a, b) {
    return this.compare(a, b) <= 0;
  }

  static compare(a, b) {
    const parsedA = a.split(".").map((x) => parseInt(x));
    const parsedB = b.split(".").map((x) => parseInt(x));

    return this.recursiveCompare(parsedA, parsedB);
  }

  static recursiveCompare(a, b) {
    if (a.length === 0) {
      a = [0];
    }

    if (b.length === 0) {
      b = [0];
    }

    if (a[0] !== b[0] || (a.length === 1 && b.length === 1)) {
      if (a[0] < b[0]) {
        return -1;
      }

      if (a[0] > b[0]) {
        return 1;
      }

      return 0;
    }

    return this.recursiveCompare(a.slice(1), b.slice(1));
  }
}

class CustomWebSocket {
    constructor(url, protocols = [], debug = true) {
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0; // CONNECTING
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this._debug = debug;
  
      this._host = this._parseUrl(url);
      this._identity = "websocket-client";
      this._key = this._generateKey();
      this._connection = null;
      this._buffer = [];
  
      this._log(
        `Initializing WebSocket connection with url=${url}, protocols=${protocols.join(
          ","
        )}`
      );
      this._initConnection();
    }
  
    _log(message) {
      if (this._debug) {
        device.log(`[WebSocket ${new Date().toISOString()}] ${message}`);
      }
    }
  
    _parseUrl(url) {
      this._log(`Parsing URL: ${url}`);
      try {
        const urlObj = new URL(url);
        if (urlObj.protocol === "ws:") {
          this._log(
            "Warning: Using ws://; server likely expects plain WebSocket over TCP"
          );
        }
        return {
          host: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === "wss:" ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
        };
      } catch (err) {
        this._log(`Failed to parse URL: ${err.message}`);
        throw err;
      }
    }
  
    _generateKey() {
      this._log("Generating WebSocket key");
      const bytes = new Array(16);
      for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      if (typeof base64.Encode !== "function") {
        this._log("Error: base64.Encode is not a function");
        throw new Error("base64.Encode is not a function");
      }
      let key;
      try {
        key = base64.Encode(bytes);
        this._log(`Generated key: ${key}`);
      } catch (err) {
        this._log(`Failed to encode key: ${err.message}`);
        throw err;
      }
      return key;
    }
  
    _initConnection() {
      this._log("Setting up connection");
      this._log(
        `Parameters: host=${this._host.host}, port=${this._host.port}, identity=${this._identity}, key=${this._key}`
      );
  
      try {
        // Log module states
        this._log(
          `dtls module: createConnection=${typeof dtls.createConnection}, onConnectionEstablished=${typeof dtls.onConnectionEstablished}, hasEncryptedConnection=${typeof dtls.hasEncryptedConnection}`
        );
        this._log(
          `udp module: send=${typeof udp.send}, onData=${typeof udp.onData}, onMessage=${typeof udp.onMessage}, onCallback=${typeof udp.onCallback}`
        );
        this._log(`udp module properties: ${Object.keys(udp).join(', ')}`);
        this._log(
          `Initial DTLS connection state: hasEncryptedConnection=${dtls.hasEncryptedConnection()}`
        );
  
        // Test UDP connectivity
        this._log("Testing UDP connectivity to server");
        try {
          udp.send(this._host.host, this._host.port, [0x00], false);
          this._log("UDP test packet sent successfully");
        } catch (err) {
          this._log(`UDP test failed: ${err.message}`);
        }
  
        // Register UDP message handler
        this._log(`Registering udp.onMessage, type=${typeof udp.onMessage}`);
        if (typeof udp.onMessage === 'function') {
          udp.onMessage((data, host, port) => {
            this._log(`Received UDP data from ${host}:${port}, length=${data.length}`);
            this._handleData(data);
          });
        } else {
          this._log('udp.onMessage is not a function');
        }
  
        // Check udp.onCallback
        this._log(`Checking udp.onCallback, type=${typeof udp.onCallback}`);
        if (typeof udp.onCallback === 'function') {
          this._log('udp.onCallback is a function; not registering until tested');
        } else {
          this._log('udp.onCallback is not a function');
        }
  
        // DTLS setup
        dtls.onConnectionEstablished(() => {
          this._log("DTLS onConnectionEstablished callback triggered");
          if (!dtls.hasEncryptedConnection()) {
            this._log(
              "Error: DTLS connection established but no encrypted connection"
            );
            if (this.onerror) {
              this.onerror(new Error("No encrypted DTLS connection"));
            }
            this.close();
            return;
          }
  
          this.readyState = 1; // OPEN
          this._log("DTLS connection established successfully");
          this._log(
            `Post-connection DTLS state: hasEncryptedConnection=${dtls.hasEncryptedConnection()}`
          );
          this._sendHandshake();
          if (typeof this.onopen === 'function') {
            this._log("Calling onopen callback");
            this.onopen();
          }
        });
  
        dtls.onConnectionClosed(() => {
          this._log("DTLS connection closed");
          this.readyState = 3; // CLOSED
          if (this.onclose) {
            this.onclose();
          }
        });
  
        dtls.onConnectionError((err) => {
          this._log(`DTLS connection error: ${err}`);
          this.readyState = 3; // CLOSED
          if (this.onerror) {
            this.onerror(err);
          }
        });
  
        this._log("Calling dtls.createConnection");
        dtls.createConnection(
          this._host.host,
          this._host.port,
          this._identity,
          this._key
        );
        this._log(
          `DTLS connection initiated to ${this._host.host}:${this._host.port}`
        );
  
        // Log state after initiation
        this._log(
          `Post-initiation state: readyState=${
            this.readyState
          }, hasEncryptedConnection=${dtls.hasEncryptedConnection()}`
        );
  
        // Attempt WebSocket handshake via UDP
        this._log("Attempting WebSocket handshake via UDP");
        this._sendHandshake();
  
        // Assume connection is open for UDP-based handshake
        this.readyState = 1; // OPEN
        this._log("Assuming connection open for UDP handshake");
        this._log(`onopen callback: ${typeof this.onopen}`);
        if (typeof this.onopen === 'object') {
          this._log(`onopen is an object: ${JSON.stringify(this.onopen)}`);
        }
        if (typeof this.onopen === 'function') {
          this._log("Calling onopen callback");
          this.onopen();
        } else {
          this._log("No onopen callback function set");
        }
      } catch (err) {
        this._log(`Failed to initiate connection: ${err.message}`);
        if (this.onerror) {
          this.onerror(err);
        }
        this.close();
      }
    }
  
    _sendHandshake() {
      this._log("Preparing WebSocket handshake");
      const handshake = [
        `GET ${this._host.path} HTTP/1.1`,
        `Host: ${this._host.host}`,
        `Upgrade: websocket`,
        `Connection: Upgrade`,
        `Sec-WebSocket-Key: ${this._key}`,
        `Sec-WebSocket-Version: 13`,
        this.protocols.length
          ? `Sec-WebSocket-Protocol: ${this.protocols.join(", ")}`
          : "",
        "\r\n",
      ]
        .filter((line) => line)
        .join("\r\n");
  
      this._log(`Sending handshake: ${handshake}`);
      this._sendRaw(handshake);
    }
  
    send(data) {
      if (this.readyState !== 1) {
        this._log(
          `Cannot send: Connection not open (readyState=${this.readyState})`
        );
        return;
      }
  
      this._log(
        `Preparing to send data: ${typeof data === "string" ? data : "[binary]"}`
      );
      let payload;
      if (typeof data === "string") {
        payload = this._encodeUTF8(data);
      } else {
        payload = Array.from(new Uint8Array(data));
      }
  
      // WebSocket frame: FIN, opcode (text=0x1), mask=0, payload length, payload
      const frame = [0x81]; // FIN=1, opcode=0x1 (text)
      if (payload.length <= 125) {
        frame.push(payload.length);
      } else if (payload.length <= 0xffff) {
        frame.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
      } else {
        frame.push(127, ...this._numberToBytes(payload.length, 8));
      }
      frame.push(...payload);
  
      this._log(`Sending WebSocket frame with length=${frame.length}`);
      this._sendRaw(frame);
    }
  
    _encodeUTF8(str) {
      this._log(`Encoding string to UTF-8, length=${str.length}`);
      const bytes = [];
      for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);
        if (code < 0x80) {
          bytes.push(code);
        } else if (code < 0x800) {
          bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0x10000) {
          bytes.push(
            0xe0 | (code >> 12),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f)
          );
        }
      }
      return bytes;
    }
  
    _decodeUTF8(bytes) {
      this._log(`Decoding UTF-8 bytes, length=${bytes.length}`);
      let result = "";
      let i = 0;
      while (i < bytes.length) {
        const byte1 = bytes[i];
        if (byte1 < 0x80) {
          result += String.fromCharCode(byte1);
          i++;
        } else if (byte1 >= 0xc0 && byte1 < 0xe0) {
          const byte2 = bytes[i + 1];
          result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
          i += 2;
        } else if (byte1 >= 0xe0 && byte1 < 0xf0) {
          const byte2 = bytes[i + 1];
          const byte3 = bytes[i + 2];
          result += String.fromCharCode(
            ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f)
          );
          i += 3;
        } else {
          this._log(`Skipping invalid UTF-8 byte: ${byte1}`);
          i++;
        }
      }
      return result;
    }
  
    _sendRaw(data) {
      this._log(`Attempting to send data via UDP, length=${data.length}`);
      try {
        // Convert string to byte array if necessary
        const dataBytes = typeof data === "string" ? this._encodeUTF8(data) : data;
        udp.send(this._host.host, this._host.port, dataBytes, false);
        this._log("Data sent successfully via UDP");
      } catch (err) {
        this._log(`Failed to send via UDP: ${err.message}`);
        this._buffer.push(data);
        this._log(`Buffered data: length=${data.length}`);
      }
    }
  
    _numberToBytes(num, bytes) {
      this._log(`Converting number to ${bytes} bytes: ${num}`);
      const result = [];
      for (let i = bytes - 1; i >= 0; i--) {
        result.push((num >> (i * 8)) & 0xff);
      }
      return result;
    }
  
    close() {
      if (this.readyState === 1) {
        this._log("Initiating connection close");
        // Send close frame
        this._sendRaw([0x88, 0x00]); // Close opcode with no status code
        dtls.CloseConnection();
        this.readyState = 2; // CLOSING
      } else {
        this._log(
          `Cannot close: Connection not open (readyState=${this.readyState})`
        );
      }
    }
  
    _handleData(data) {
      this._log(`Processing received data, length=${data.length}`);
      if (typeof base64.Decode !== "function") {
        this._log("Error: base64.Decode is not a function");
        throw new Error("base64.Decode is not a function");
      }
      let bytes;
      try {
        bytes = Array.isArray(data) ? data : base64.Decode(data);
      } catch (err) {
        this._log(`Failed to decode data: ${err.message}`);
        throw err;
      }
  
      // Check if this is an HTTP response (WebSocket handshake response)
      const text = this._decodeUTF8(bytes);
      this._log(`Decoded data: ${text}`);
      if (text.startsWith("HTTP/1.1")) {
        this._log("Received WebSocket handshake response");
        if (text.includes("101 Switching Protocols")) {
          this._log("WebSocket connection established via UDP");
          this.readyState = 1; // Ensure OPEN
          if (typeof this.onopen === 'function') {
            this._log("Calling onopen callback for handshake response");
            this.onopen();
          }
        } else {
          this._log(`Handshake failed: ${text}`);
          if (this.onerror) {
            this.onerror(new Error(`Handshake failed: ${text}`));
          }
          this.close();
        }
        return;
      }
  
      // Handle WebSocket frames if connection is open
      if (this.readyState !== 1) {
        this._log(
          `Ignoring WebSocket frame: Connection not open (readyState=${this.readyState})`
        );
        return;
      }
  
      // Parse WebSocket frame
      if (bytes.length < 2) {
        this._log(`Invalid frame: Too short, length=${bytes.length}`);
        return;
      }
  
      const fin = (bytes[0] & 0x80) !== 0;
      const opcode = bytes[0] & 0x0f;
      const mask = (bytes[1] & 0x80) !== 0;
      let payloadLen = bytes[1] & 0x7f;
      let offset = 2;
  
      this._log(
        `Parsing frame: fin=${fin}, opcode=${opcode}, mask=${mask}, payloadLen=${payloadLen}`
      );
  
      if (payloadLen === 126) {
        payloadLen = (bytes[2] << 8) | bytes[3];
        offset = 4;
        this._log(`Extended payload length (16-bit): ${payloadLen}`);
      } else if (payloadLen === 127) {
        payloadLen = 0;
        for (let i = 0; i < 8; i++) {
          payloadLen = (payloadLen << 8) | bytes[offset + i];
        }
        offset = 8;
        this._log(`Extended payload length (64-bit): ${payloadLen}`);
      }
  
      if (opcode === 0x1) {
        // Text frame
        const payload = bytes.slice(offset, offset + payloadLen);
        this._log(`Processing text frame, payload length=${payload.length}`);
        const message = this._decodeUTF8(payload);
        if (this.onmessage) {
          this._log(`Dispatching message: ${message}`);
          this.onmessage({ data: message });
        }
      } else if (opcode === 0x8) {
        // Close frame
        this._log("Received close frame");
        this.close();
      } else {
        this._log(`Unsupported opcode: ${opcode}`);
      }
    }
  }

export function ImageUrl() {
  return "https://assets.signalrgb.com/brands/nanoleaf/logo.png";
}
