import { spawn } from "node:child_process";

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;
const DEFAULT_KILL_GRACE_MS = 1_000;

function asBuffer(chunk) {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

async function terminateProcessTree(child, signal) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", () => resolve());
      killer.once("close", () => resolve());
    });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* Process already exited. */ }
  }
}

export async function runProcess(command, args = [], options = {}) {
  const {
    cwd,
    env = process.env,
    input,
    timeoutMs = 0,
    maxBuffer = DEFAULT_MAX_BUFFER,
    killGraceMs = DEFAULT_KILL_GRACE_MS,
  } = options;

  return new Promise((resolve) => {
    let child;
    let timedOut = false;
    let outputOverflow = false;
    let spawnError = null;
    let settled = false;
    let killTimer = null;
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;

    const finish = (status, signal) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      const stdoutBuffer = Buffer.concat(stdout);
      const stderrBuffer = Buffer.concat(stderr);
      resolve({
        status: spawnError ? null : Number.isInteger(status) ? status : null,
        signal: signal ?? null,
        stdout: stdoutBuffer.toString("utf8"),
        stderr: stderrBuffer.toString("utf8"),
        stdoutBuffer,
        stderrBuffer,
        error: spawnError,
        timedOut,
        outputOverflow,
      });
    };

    const stop = async (reason) => {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      if (reason === "timeout") timedOut = true;
      if (reason === "maxBuffer") outputOverflow = true;
      await terminateProcessTree(child, "SIGTERM");
      killTimer = setTimeout(() => { void terminateProcessTree(child, "SIGKILL"); }, killGraceMs);
      killTimer.unref?.();
    };

    try {
      child = spawn(command, args, {
        cwd,
        env,
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      spawnError = error;
      finish(null, null);
      return;
    }

    child.stdout.on("data", (chunk) => {
      const buffer = asBuffer(chunk);
      stdoutBytes += buffer.length;
      if (stdoutBytes + stderrBytes <= maxBuffer) stdout.push(buffer);
      else void stop("maxBuffer");
    });
    child.stderr.on("data", (chunk) => {
      const buffer = asBuffer(chunk);
      stderrBytes += buffer.length;
      if (stdoutBytes + stderrBytes <= maxBuffer) stderr.push(buffer);
      else void stop("maxBuffer");
    });
    child.once("error", (error) => {
      spawnError = error;
      if (child.exitCode === null && child.signalCode === null) finish(null, null);
    });
    child.once("close", (status, signal) => finish(status, signal));

    if (input === undefined || input === null) child.stdin.end();
    else child.stdin.end(input);

    var timeoutTimer = null;
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => { void stop("timeout"); }, timeoutMs);
      timeoutTimer.unref?.();
    }
  });
}
