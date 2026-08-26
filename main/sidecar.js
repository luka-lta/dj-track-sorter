// main/sidecar.js
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');

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
      for (const { reject } of this.pending.values()) {
        reject(new Error('Sidecar-Prozess wurde beendet'));
      }
      this.pending.clear();
      this.emit('crash', code);
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
    if (response.ok) {
      entry.resolve(response.result);
    } else {
      entry.reject(new Error(response.error));
    }
  }

  send(cmd, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
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
