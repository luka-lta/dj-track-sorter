// main/sidecar.js
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');

/** Zeitlimit für eine einzelne Sidecar-Anfrage in Millisekunden (30 Sekunden). */
const REQUEST_TIMEOUT_MS = 30 * 1000;

class Sidecar extends EventEmitter {
  constructor(command, args) {
    super();
    this.command = command;
    this.args = args;
    this.process = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  start(settingsPath) {
    this.process = spawn(this.command, [...this.args, settingsPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const rl = readline.createInterface({ input: this.process.stdout });
    rl.on('line', (line) => this._handleLine(line));

    this.process.stderr.on('data', (chunk) => {
      console.error('[sidecar stderr]', chunk.toString());
    });

    this.process.on('exit', (code) => {
      for (const { reject, timeoutId } of this.pending.values()) {
        clearTimeout(timeoutId);
        reject(new Error('Sidecar-Prozess wurde beendet'));
      }
      this.pending.clear();
      this.emit('crash', code);
    });

    this.process.on('error', (err) => {
      for (const { reject, timeoutId } of this.pending.values()) {
        clearTimeout(timeoutId);
        reject(err);
      }
      this.pending.clear();
      this.emit('crash', err);
    });
  }

  _handleLine(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch (e) {
      console.error('[sidecar] invalid JSON line:', line);
      return;
    }
    const entry = this.pending.get(response.id);
    if (!entry) return;
    this.pending.delete(response.id);
    clearTimeout(entry.timeoutId);
    if (response.ok) {
      entry.resolve(response.result);
    } else {
      entry.reject(new Error(response.error));
    }
  }

  send(cmd, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Sidecar-Anfrage "${cmd}" hat das Zeitlimit überschritten`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeoutId });
      this.process.stdin.write(JSON.stringify({ id, cmd, params }) + '\n');
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

module.exports = { Sidecar };
