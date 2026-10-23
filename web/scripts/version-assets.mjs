import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const page = new URL("../public/index.html", import.meta.url);
let html = await readFile(page, "utf8");
for (const match of [...html.matchAll(/(?:src|href)="\/([^"?]+\.(?:js|css))(?:\?[^\"]*)?"/g)]) {
  const data = await readFile(new URL("../public/" + match[1], import.meta.url));
  const version = createHash("sha256").update(data).digest("hex").slice(0, 12);
  html = html.replace(match[0], match[0].split('="')[0] + '="/' + match[1] + '?v=' + version + '"');
}
await writeFile(page, html);
console.log("Versioned browser assets using their content hashes.");
