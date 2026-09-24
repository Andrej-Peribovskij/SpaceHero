import { existsSync, copyFileSync, mkdirSync } from "node:fs";

const mappings = [
  { example: ".env.example", target: ".env" },
  { example: "apps/web/.env.example", target: "apps/web/.env" }
];

for (const mapping of mappings) {
  if (!existsSync(mapping.target)) {
    const dir = mapping.target.split("/").slice(0, -1).join("/");
    if (dir) mkdirSync(dir, { recursive: true });
    copyFileSync(mapping.example, mapping.target);
    console.log(`Created ${mapping.target} from ${mapping.example}`);
  }
}
