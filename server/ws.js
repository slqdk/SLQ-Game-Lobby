// A small WebSocket server (RFC 6455) on top of Node's http "upgrade" event. No dependencies.
// It handles text and binary messages, fragments, ping/pong and close; no compression extension is offered.
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;          // bytes a client may send in one message
const MAX_BACKLOG = 2 * 1024 * 1024;    // bytes waiting to be sent before a client counts as gone

export class Peer {
  constructor(socket) {
    this.socket = socket;
    this.open = true;
    this.ended = false;
    this.alive = Date.now();            // when the other side was last heard from
    this.onmessage = null;              // (text or Buffer, isBinary)
    this.onclose = null;
    this.buf = null;                    // bytes received and not yet a whole frame
    this.parts = []; this.partLen = 0; this.partOp = 0;   // a message arriving in fragments
    socket.on('data', d => this.feed(d));
    socket.on('close', () => this.done());
    socket.on('error', () => this.done());
  }

  feed(d) {
    if (!this.open) return;
    this.buf = this.buf && this.buf.length ? Buffer.concat([this.buf, d]) : d;
    try { this.parse(); } catch (e) { console.error('ws:', e); this.close(1011); }
  }

  parse() {
    for (;;) {
      const b = this.buf;
      if (!this.open || !b || b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f;
      let len = b[1] & 0x7f, off = 2;
      if (b[0] & 0x70 || !(b[1] & 0x80)) return this.close(1002);      // extension bits, or a frame that is not masked
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2)) return this.close(1009); len = b.readUInt32BE(6); off = 10; }
      if (len > MAX_MESSAGE) return this.close(1009);
      if (op >= 8 && (len > 125 || !fin)) return this.close(1002);     // control frames are short and whole
      if (b.length < off + 4 + len) return;
      const data = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) data[i] = b[off + 4 + i] ^ b[off + (i & 3)];
      this.buf = b.subarray(off + 4 + len);
      this.alive = Date.now();
      if (op === 8) return this.close(1000);
      if (op === 9) { this.frame(10, data); continue; }
      if (op === 10) continue;
      if (op === 0) { if (!this.partOp) return this.close(1002); }
      else if (op === 1 || op === 2) { if (this.partOp) return this.close(1002); this.partOp = op; }
      else return this.close(1002);
      this.parts.push(data); this.partLen += len;
      if (this.partLen > MAX_MESSAGE) return this.close(1009);
      if (!fin) continue;
      const whole = this.parts.length === 1 ? this.parts[0] : Buffer.concat(this.parts), kind = this.partOp;
      this.parts = []; this.partLen = 0; this.partOp = 0;
      if (this.onmessage) this.onmessage(kind === 1 ? whole.toString('utf8') : whole, kind === 2);
    }
  }

  frame(op, data) {
    if (!this.open || this.socket.destroyed) return;
    if (this.socket.writableLength > MAX_BACKLOG) { this.socket.destroy(); return; }
    const len = data.length;
    let head;
    if (len < 126) { head = Buffer.allocUnsafe(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.allocUnsafe(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.allocUnsafe(10); head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6); }
    head[0] = 0x80 | op;
    this.socket.write(len ? Buffer.concat([head, data]) : head);
  }

  send(text) { this.frame(1, Buffer.from(text, 'utf8')); }
  sendBinary(buf) { this.frame(2, buf); }
  ping() { this.frame(9, Buffer.alloc(0)); }

  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.allocUnsafe(2); b.writeUInt16BE(code, 0);
    this.frame(8, b);
    this.open = false;
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 2000).unref();
  }

  done() {
    if (this.ended) return;
    this.ended = true; this.open = false;
    if (this.onclose) this.onclose();
  }
}

// Answers an upgrade request. Returns the Peer, or null when the request was not a WebSocket handshake.
export function upgrade(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (req.method !== 'GET' || String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  socket.setTimeout(0);
  const peer = new Peer(socket);
  if (head && head.length) peer.feed(head);
  return peer;
}
