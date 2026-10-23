import net from "node:net";

export class Client {
  constructor(socket) {
    this.socket = socket;
    this.buffer = "";
    this.sequence = 0;
    this.pending = new Map();
    this.onPublish = () => {};
    socket.setEncoding("utf8");
    socket.setNoDelay(true);
    socket.on("data", (chunk) => {
      this.buffer += chunk;
      let end;
      while ((end = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        const pending = this.pending.get(message.id);
        if (
          pending &&
          (message.op === "service_response" || message.op === "status")
        ) {
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.level === "error") pending.reject(Error(message.msg));
          else pending.resolve(message);
        }
        if (message.op === "publish")
          this.onPublish(message.topic, message.msg);
      }
    });
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => this.fail(Error("Runtime connection closed")));
  }

  fail(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  static connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: "127.0.0.1", port: 9095 });
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.removeListener("error", reject);
        resolve(new Client(socket));
      });
    });
  }

  send(message) {
    this.socket.write(JSON.stringify(message) + "\n");
  }

  request(message) {
    const id = `portfolio-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error(`Runtime request timed out: ${message.op}`));
      }, 2000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ ...message, id });
    });
  }

  call(service, args) {
    return this.request({ op: "call_service", service, args });
  }
  subscribe(topic) {
    return this.request({ op: "subscribe", topic, type: "portfolio" });
  }
  advertise(topic) {
    this.send({ op: "advertise", topic, type: "portfolio" });
  }
  publish(topic, msg) {
    this.send({ op: "publish", topic, msg });
  }
  close() {
    this.socket.end();
  }
}
