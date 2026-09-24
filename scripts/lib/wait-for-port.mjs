import { connect } from "node:net";

/**
 * Resolves once a TCP connection to `port` is accepted, or rejects at
 * `deadline`.
 *
 * Compose's `--wait` proves a container is healthy on the engine's own
 * network. It does not prove the published port answers on this host, and that
 * is what everything downstream connects to. Under rootless podman the port
 * forwarder is programmed separately from the container, and on Windows and
 * macOS there is a podman-machine hop on top of that, so the mapping can lag
 * the healthcheck.
 */
export async function waitForPort(port, { host = "127.0.0.1", deadline, label }) {
  let lastError;

  while (Date.now() < deadline) {
    try {
      await attempt(port, host);
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }

  throw new Error(
    `${label ?? `port ${port}`} did not accept a connection on ${host}:${port} in time` +
      `${lastError ? ` (last error: ${lastError.code ?? lastError.message})` : ""}.`,
  );
}

function attempt(port, host) {
  return new Promise((resolve, reject) => {
    const socket = connect({ port, host });

    const settle = (error) => {
      socket.removeAllListeners();
      socket.destroy();
      error ? reject(error) : resolve();
    };

    socket.setTimeout(1000);
    socket.once("connect", () => settle());
    socket.once("timeout", () => settle(new Error("timeout")));
    socket.once("error", settle);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
