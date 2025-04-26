export function Name() { return "HA Homekit Lights"; }
export function VendorId() { return 0x0000; }
export function ProductId() { return 0x0001; }
export function Publisher() { return "Fuad Chonora"; }
export function Size() { return [1, 1]; }
export function DefaultPosition() { return [0, 0]; }
export function DefaultScale() { return 1.0; }
export function Category() { return "Lighting"; }

export function Initialize() {
  console.log("HA Homekit Lights Test Initialized");
}

export function Render() {
  console.log("HA Homekit Lights Test Rendered");
}
