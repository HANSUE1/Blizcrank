// Inline SVG: line art for product cards, banners and category tiles (shown when there is no photo), and shared icons.

const PATHS = {
  laptop:
    '<path d="M22 18h76a4 4 0 0 1 4 4v38H18V22a4 4 0 0 1 4-4Z"/>' +
    '<path d="M10 72h100l-8-12H18l-8 12Z"/>' +
    '<path d="M52 72h16" stroke-width="3.2"/>' +
    '<path d="M30 30h36M30 38h24" opacity=".45"/>' +
    '<circle cx="88" cy="34" r="7" opacity=".6"/>',
  gpu:
    '<rect x="14" y="26" width="92" height="38" rx="5"/>' +
    '<circle cx="42" cy="45" r="11"/><circle cx="78" cy="45" r="11"/>' +
    '<path d="M42 34v-4M42 60v-4M31 45h-4M53 45h-4M78 34v-4M78 60v-4M89 45h-4M67 45h-4" opacity=".55"/>' +
    '<path d="M20 64v8h38v-8M14 34h-4v16h4" opacity=".7"/>',
  cpu:
    '<rect x="34" y="19" width="52" height="52" rx="6"/>' +
    '<rect x="47" y="32" width="26" height="26" rx="3" opacity=".7"/>' +
    '<path d="M44 19v-8M60 19v-8M76 19v-8M44 79v-8M60 79v-8M76 79v-8M34 29h-8M34 45h-8M34 61h-8M94 29h-8M94 45h-8M94 61h-8"/>',
  keyboard:
    '<rect x="10" y="28" width="100" height="36" rx="6"/>' +
    '<path d="M20 38h6M32 38h6M44 38h6M56 38h6M68 38h6M80 38h6M92 38h6M20 48h6M32 48h6M44 48h6M80 48h6M92 48h6M56 48h18" opacity=".65"/>' +
    '<path d="M30 56h60" opacity=".65"/>',
  mouse:
    '<path d="M60 12c17 0 24 12 24 30s-7 36-24 36-24-18-24-36 7-30 24-30Z"/>' +
    '<path d="M60 12v24M42 32h36" opacity=".6"/>' +
    '<rect x="56" y="22" width="8" height="12" rx="4" opacity=".85"/>',
  headset:
    '<path d="M26 56v-8a34 34 0 0 1 68 0v8"/>' +
    '<rect x="18" y="50" width="16" height="26" rx="6"/>' +
    '<rect x="86" y="50" width="16" height="26" rx="6"/>' +
    '<path d="M94 76v4a10 10 0 0 1-10 10H64" opacity=".6"/>',
  monitor:
    '<path d="M14 16h92a2 2 0 0 1 2 2v40a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2Z"/>' +
    '<path d="M52 60l-4 12M68 60l4 12M40 72h40"/>' +
    '<path d="M22 50c10-14 24-22 38-24" opacity=".5"/>',
  console:
    '<path d="M44 12c8 0 12 4 12 10v52c0 3-2 5-5 5H37c-3 0-5-2-5-5V22c0-6 4-10 12-10Z"/>' +
    '<path d="M76 12c-8 0-12 4-12 10v52c0 3 2 5 5 5h14c3 0 5-2 5-5V22c0-6-4-10-12-10Z"/>' +
    '<path d="M56 30h8M56 60h8" opacity=".55"/>' +
    '<path d="M40 70h8M72 70h8" opacity=".6"/>',
  handheld:
    '<rect x="30" y="24" width="60" height="42" rx="4"/>' +
    '<path d="M30 28H22a10 10 0 0 0-10 10v14a10 10 0 0 0 10 10h8M90 28h8a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10h-8"/>' +
    '<circle cx="21" cy="40" r="4" opacity=".75"/><path d="M99 36v8M95 40h8" opacity=".75"/>' +
    '<path d="M38 32h28" opacity=".45"/>',
  controller:
    '<path d="M34 26h52c11 0 18 9 20 22l3 18c1 8-8 13-14 7l-9-9H34l-9 9c-6 6-15 1-14-7l3-18c2-13 9-22 20-22Z"/>' +
    '<path d="M34 38v12M28 44h12" opacity=".8"/>' +
    '<circle cx="82" cy="38" r="2.6"/><circle cx="90" cy="45" r="2.6"/><circle cx="74" cy="45" r="2.6"/><circle cx="82" cy="52" r="2.6"/>' +
    '<circle cx="48" cy="56" r="5" opacity=".6"/><circle cx="72" cy="56" r="5" opacity=".6"/>',
  motherboard:
    '<rect x="22" y="12" width="76" height="66" rx="4"/>' +
    '<rect x="40" y="22" width="22" height="22" rx="2"/>' +
    '<path d="M72 20v30M78 20v30" opacity=".7"/>' +
    '<path d="M32 56h56M32 64h56" opacity=".6"/>' +
    '<path d="M30 20v18" opacity=".5"/><circle cx="84" cy="68" r="4" opacity=".55"/>',
  ram:
    '<path d="M10 30h100v26H10z"/>' +
    '<path d="M18 36h14v14H18zM38 36h14v14H38zM68 36h14v14H68zM88 36h14v14H88z" opacity=".65"/>' +
    '<path d="M10 56v8h46v-4h8v4h46v-8"/>' +
    '<path d="M16 24h88" opacity=".5"/>',
  ssd:
    '<rect x="10" y="32" width="100" height="26" rx="3"/>' +
    '<path d="M100 32v26" opacity=".6"/><path d="M104 40v10" opacity=".8"/>' +
    '<rect x="20" y="37" width="20" height="16" rx="2" opacity=".75"/>' +
    '<rect x="48" y="37" width="16" height="16" rx="2" opacity=".6"/><rect x="70" y="37" width="16" height="16" rx="2" opacity=".6"/>',
  psu:
    '<rect x="18" y="18" width="84" height="56" rx="5"/>' +
    '<circle cx="52" cy="46" r="18"/>' +
    '<path d="M52 28v36M34 46h36M40 34l24 24M64 34 40 58" opacity=".45"/>' +
    '<path d="M86 30v10M82 54h10" opacity=".7"/>',
};

export function art(key, color) {
  const body = PATHS[key] || PATHS.laptop;
  return `<svg class="product-art" viewBox="0 0 120 90" fill="none" stroke="${color || "#9fb2cf"}" stroke-width="2.4" ` +
         `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const CART_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.2l2.1 11.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6"/><circle cx="9.6" cy="20" r="1.4"/><circle cx="16.6" cy="20" r="1.4"/></svg>';
export const HEART_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3 4.9 13A4.8 4.8 0 0 1 12 6.4 4.8 4.8 0 0 1 19.1 13Z"/></svg>';

// Category tile illustrations.
export const CATEGORY_ART = {
  laptops: ["laptop", "#8fa7d4"], components: ["gpu", "#9fb2cf"], peripherals: ["keyboard", "#b48fd4"],
  consoles: ["console", "#c9d4ea"], gpus: ["gpu", "#9fb2cf"], cpus: ["cpu", "#86c79b"],
  motherboards: ["motherboard", "#9fb2cf"], memory: ["ram", "#e0b670"], storage: ["ssd", "#9ccbe0"],
  "power-supplies": ["psu", "#b8c1d4"], keyboards: ["keyboard", "#b48fd4"], mice: ["mouse", "#9ccbe0"],
  headsets: ["headset", "#7fd0a8"], monitors: ["monitor", "#e0b670"], handhelds: ["handheld", "#ef8a8a"],
  controllers: ["controller", "#dfe5f2"],
};

export const categoryArt = (slug) => art(...(CATEGORY_ART[slug] ?? ["laptop", "#9fb2cf"]));
