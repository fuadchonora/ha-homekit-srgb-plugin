export function Name() { return "HA Homekit Lights"; }
export function VendorId() { return 0x0000; } // Custom Vendor ID
export function ProductId() { return 0x0001; } // Custom Product ID
export function Publisher() { return "Fuad Chonora"; }
export function Size() { return [1, 1]; } // Single LED
export function DefaultPosition() { return [0, 0]; }
export function DefaultScale() { return 1.0; }

let vLedNames = ["Bulb"];
let vLedPositions = [[0, 0]];

export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }

let ws = null;
let commandId = 1;
let isConnected = false;

export function Initialize() {
  connectToHomeAssistant();
}

function connectToHomeAssistant() {
  ws = new WebSocket(`ws://${options.haHost}:8123/api/websocket`);

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "auth",
      access_token: options.haToken
    }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "auth_ok") {
      isConnected = true;
    } else if (message.type === "auth_invalid") {
      console.error("Authentication failed:", message.message);
      ws.close();
    }
  };

  ws.onclose = () => {
    isConnected = false;
    setTimeout(connectToHomeAssistant, 5000); // Retry connection
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
}

function sendColorToBulb(rgb) {
  if (!isConnected || !ws) return;

  const payload = {
    id: commandId++,
    type: "call_service",
    domain: "light",
    service: "turn_on",
    service_data: {
      entity_id: options.entityId,
      rgb_color: rgb
    }
  };

  ws.send(JSON.stringify(payload));
}

export function Render() {
  const color = device.color(0, 0); // Get color from the virtual LED
  sendColorToBulb(color);
}

export function Shutdown() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function Options() {
    return {
        haToken: {
            name: "Home Assistant Token",
            type: "text",
            default: "",
            placeholder: "Paste your Long-Lived Access Token here"
        },
        haHost: {
            name: "Home Assistant Host",
            type: "text",
            default: "192.168.18.37",
            placeholder: "e.g., 192.168.18.37"
        },
        entityId: {
            name: "Entity ID",
            type: "text",
            default: "light.backlight_nanoleaf_light_strip",
            placeholder: "e.g., light.your_nanoleaf_entity"
        }
    };
}
