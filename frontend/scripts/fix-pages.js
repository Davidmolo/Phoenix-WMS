const fs = require("fs");
const path = require("path");

const root = path.join("D:/phoenix-wms/frontend/src/app/(app)");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name === "page.tsx") files.push(full);
  }
  return files;
}

function fixEncoding(c) {
  return c
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€¦/g, "…")
    .replace(/Â·/g, "·")
    .replace(/â€™/g, "'");
}

for (const file of walk(root)) {
  let c = fs.readFileSync(file, "utf8");
  const original = c;

  c = c.replace(/import \{ AppShell \} from "@\/components\/AppShell";\r?\n/g, "");
  c = fixEncoding(c);

  // Remove any leftover AppShell tags
  c = c.replace(/^[ \t]*<AppShell>\r?\n/gm, "");
  c = c.replace(/^[ \t]*<\/AppShell>\r?\n/gm, "");

  // Wrap export default function's main return if not already a fragment/single root wrapper
  c = c.replace(/(\n  return \()\n([\s\S]*?)\n(  \);)/g, (match, start, body, end) => {
    const trimmed = body.replace(/^\s+/, "");
    if (trimmed.startsWith("<>") || trimmed.startsWith("<Fragment")) return match;
    // Single element return (one opening tag until matching close at start indent) — still wrap if siblings exist
    const sibling =
      /<\/[A-Za-z][\w.]*>\s*\n\s*</.test(body) ||
      /\/>\s*\n\s*</.test(body) ||
      /\}\s*\n\s*</.test(body) ||
      /null\s*\n\s*</.test(body);
    if (!sibling && !trimmed.startsWith("<PageHeader") && !trimmed.startsWith("<FormSection")) {
      // warehouse loading: return ( <SkeletonPage /> ) — single child OK
      return match;
    }
    // Normalize body indent to 6 spaces inside fragment
    const lines = body.split("\n");
    const content = lines
      .map((line) => {
        if (!line.trim()) return "";
        return "      " + line.trimStart();
      })
      .join("\n");
    return `${start}\n    <>\n${content}\n    </>\n${end}`;
  });

  if (c !== original) {
    fs.writeFileSync(file, c);
    console.log("fixed", path.relative(root, file));
  } else {
    console.log("ok", path.relative(root, file));
  }
}
