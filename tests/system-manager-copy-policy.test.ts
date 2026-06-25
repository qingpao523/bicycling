import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectDir = path.resolve(__dirname, "..");

describe("system manager production copy policy", () => {
  it("does not copy repository metadata or worktrees into production-current", () => {
    const managerScript = readFileSync(path.join(projectDir, "scripts", "system-manager.mjs"), "utf8");

    expect(managerScript).toContain('relative === ".git"');
    expect(managerScript).toContain('relative.startsWith(`.git${path.sep}`)');
    expect(managerScript).toContain('relative === ".worktrees"');
    expect(managerScript).toContain('relative.startsWith(`.worktrees${path.sep}`)');
  });
});
