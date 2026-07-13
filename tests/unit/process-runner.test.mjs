import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runProcess } from "../../scripts/lib/process-runner.mjs";

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      if (stat.split(" ")[2] === "Z") return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return check();
}

test("runProcess reports a missing executable without throwing", async () => {
  const result = await runProcess(`ace-missing-${process.pid}`, [], { timeoutMs: 1_000 });
  assert.equal(result.status, null);
  assert.equal(result.error?.code, "ENOENT");
  assert.equal(result.timedOut, false);
});

test("runProcess bounds combined output and terminates the producer", async () => {
  const result = await runProcess(process.execPath, ["-e", "process.stdout.write(\"x\".repeat(65536)); setInterval(()=>{},1000)"], {
    timeoutMs: 5_000,
    maxBuffer: 1_024,
    killGraceMs: 50,
  });
  assert.equal(result.outputOverflow, true);
  assert.ok(Buffer.byteLength(result.stdout) <= 1_024);
});

test("runProcess timeout terminates the child process tree", { skip: process.platform === "win32" }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ace-process-tree-"));
  const pidFile = path.join(temp, "grandchild.pid");
  const parentFile = path.join(temp, "parent.mjs");
  fs.writeFileSync(parentFile, `
    import fs from "node:fs";
    import { spawn } from "node:child_process";
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    setInterval(()=>{},1000);
  `);
  try {
    const result = await runProcess(process.execPath, [parentFile], {
      timeoutMs: 1_500,
      killGraceMs: 100,
    });
    assert.equal(result.timedOut, true);
    assert.equal(fs.existsSync(pidFile), true);
    const grandchildPid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.equal(await waitFor(() => !processIsAlive(grandchildPid)), true, `grandchild ${grandchildPid} survived timeout`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
